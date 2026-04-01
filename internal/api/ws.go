package api

import (
	"bytes"
	"context"
	"database/sql"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

type wsClientMessage struct {
	Type  string `json:"type"`
	JobID string `json:"jobId"`
}

type jobStream struct {
	store interface {
		GetJob(context.Context, string) (domain.Job, error)
	}
	conn       *wsConn
	jobID      string
	offsets    map[string]int64
	lastStatus domain.JobStatus
	lastError  string
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request, _ domain.User) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	conn, err := upgradeWebSocket(w, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	stream := &jobStream{
		store:   s.jobs,
		conn:    conn,
		offsets: map[string]int64{},
	}

	msgCh := make(chan wsClientMessage, 1)
	errCh := make(chan error, 1)

	go func() {
		defer close(errCh)
		for {
			payload, err := conn.ReadJSON()
			if err != nil {
				errCh <- err
				return
			}
			var msg wsClientMessage
			if err := jsonUnmarshal(payload, &msg); err != nil {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "invalid message"})
				continue
			}
			msgCh <- msg
		}
	}()

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		select {
		case msg := <-msgCh:
			if msg.Type != "subscribe" || msg.JobID == "" {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "expected subscribe message"})
				continue
			}
			stream.subscribe(msg.JobID)
			if err := stream.tick(ctx); err != nil && err != sql.ErrNoRows {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": err.Error()})
			}

		case <-ticker.C:
			if stream.jobID == "" {
				continue
			}
			if err := stream.tick(ctx); err != nil {
				if err == sql.ErrNoRows {
					_ = conn.WriteJSON(map[string]any{"type": "status", "jobId": stream.jobID, "status": "missing"})
					continue
				}
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": err.Error()})
			}

		case err, ok := <-errCh:
			if !ok || err == nil || err == io.EOF {
				return
			}
			return
		}
	}
}

func (s *jobStream) subscribe(jobID string) {
	s.jobID = jobID
	s.offsets = map[string]int64{}
	s.lastStatus = ""
	s.lastError = ""
}

func (s *jobStream) tick(ctx context.Context) error {
	job, err := s.store.GetJob(ctx, s.jobID)
	if err != nil {
		return err
	}
	if job.Status != s.lastStatus || job.Error != s.lastError {
		s.lastStatus = job.Status
		s.lastError = job.Error
		if err := s.conn.WriteJSON(map[string]any{
			"type":   "status",
			"jobId":  job.ID,
			"status": job.Status,
			"error":  job.Error,
		}); err != nil {
			return err
		}
	}

	if job.Workdir == "" {
		return nil
	}

	files, err := filepath.Glob(filepath.Join(job.Workdir, ".infra-orch", "logs", "*.log"))
	if err != nil {
		return err
	}
	sort.Strings(files)

	for _, path := range files {
		nextOffset, chunks, err := readLogChunks(path, s.offsets[path])
		if err != nil {
			if os.IsNotExist(err) {
				delete(s.offsets, path)
				continue
			}
			return err
		}
		s.offsets[path] = nextOffset
		for _, chunk := range chunks {
			if err := s.conn.WriteJSON(map[string]any{
				"type":    "log",
				"jobId":   job.ID,
				"file":    filepath.Base(path),
				"message": chunk,
			}); err != nil {
				return err
			}
		}
	}

	return nil
}

func readLogChunks(path string, offset int64) (int64, []string, error) {
	f, err := os.Open(path)
	if err != nil {
		return offset, nil, err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return offset, nil, err
	}
	if info.Size() < offset {
		offset = 0
	}
	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		return offset, nil, err
	}

	payload, err := io.ReadAll(f)
	if err != nil {
		return offset, nil, err
	}
	if len(payload) == 0 {
		return offset, nil, nil
	}
	return offset + int64(len(payload)), []string{string(payload)}, nil
}

func jsonUnmarshal(payload []byte, out any) error {
	return decodeJSON(bytes.NewReader(payload), out)
}
