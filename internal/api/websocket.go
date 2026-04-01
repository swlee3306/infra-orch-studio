package api

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
)

const (
	wsTextMessage = 0x1
	wsClose       = 0x8
	wsPing        = 0x9
	wsPong        = 0xA
)

type wsConn struct {
	conn net.Conn
	rw   *bufio.ReadWriter
	mu   sync.Mutex
}

func upgradeWebSocket(w http.ResponseWriter, r *http.Request) (*wsConn, error) {
	if !headerContainsToken(r.Header, "Connection", "upgrade") || !headerContainsToken(r.Header, "Upgrade", "websocket") {
		return nil, errors.New("websocket upgrade required")
	}
	key := strings.TrimSpace(r.Header.Get("Sec-WebSocket-Key"))
	if key == "" {
		return nil, errors.New("missing Sec-WebSocket-Key")
	}

	hijacker, ok := w.(http.Hijacker)
	if !ok {
		return nil, errors.New("http hijacking not supported")
	}

	conn, rw, err := hijacker.Hijack()
	if err != nil {
		return nil, fmt.Errorf("hijack websocket: %w", err)
	}

	accept := websocketAccept(key)
	response := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
	if _, err := rw.WriteString(response); err != nil {
		_ = conn.Close()
		return nil, err
	}
	if err := rw.Flush(); err != nil {
		_ = conn.Close()
		return nil, err
	}

	return &wsConn{conn: conn, rw: rw}, nil
}

func (c *wsConn) Close() error {
	_ = c.writeFrame(wsClose, nil)
	return c.conn.Close()
}

func (c *wsConn) WriteJSON(v any) error {
	payload, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return c.writeFrame(wsTextMessage, payload)
}

func (c *wsConn) ReadJSON() ([]byte, error) {
	for {
		opcode, payload, err := c.readFrame()
		if err != nil {
			return nil, err
		}
		switch opcode {
		case wsTextMessage:
			return payload, nil
		case wsPing:
			if err := c.writeFrame(wsPong, payload); err != nil {
				return nil, err
			}
		case wsPong:
			continue
		case wsClose:
			return nil, io.EOF
		default:
			return nil, fmt.Errorf("unsupported websocket opcode %d", opcode)
		}
	}
}

func (c *wsConn) readFrame() (byte, []byte, error) {
	header := make([]byte, 2)
	if _, err := io.ReadFull(c.rw, header); err != nil {
		return 0, nil, err
	}
	if header[0]&0x80 == 0 {
		return 0, nil, errors.New("fragmented websocket frames are not supported")
	}
	opcode := header[0] & 0x0F
	masked := header[1]&0x80 != 0
	if !masked {
		return 0, nil, errors.New("client websocket frame must be masked")
	}

	payloadLen := uint64(header[1] & 0x7F)
	switch payloadLen {
	case 126:
		var ext [2]byte
		if _, err := io.ReadFull(c.rw, ext[:]); err != nil {
			return 0, nil, err
		}
		payloadLen = uint64(binary.BigEndian.Uint16(ext[:]))
	case 127:
		var ext [8]byte
		if _, err := io.ReadFull(c.rw, ext[:]); err != nil {
			return 0, nil, err
		}
		payloadLen = binary.BigEndian.Uint64(ext[:])
	}

	mask := make([]byte, 4)
	if _, err := io.ReadFull(c.rw, mask); err != nil {
		return 0, nil, err
	}
	payload := make([]byte, payloadLen)
	if _, err := io.ReadFull(c.rw, payload); err != nil {
		return 0, nil, err
	}
	for i := range payload {
		payload[i] ^= mask[i%4]
	}
	return opcode, payload, nil
}

func (c *wsConn) writeFrame(opcode byte, payload []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	var header []byte
	payloadLen := len(payload)
	switch {
	case payloadLen < 126:
		header = []byte{0x80 | opcode, byte(payloadLen)}
	case payloadLen <= 65535:
		header = []byte{0x80 | opcode, 126, 0, 0}
		binary.BigEndian.PutUint16(header[2:], uint16(payloadLen))
	default:
		header = []byte{0x80 | opcode, 127, 0, 0, 0, 0, 0, 0, 0, 0}
		binary.BigEndian.PutUint64(header[2:], uint64(payloadLen))
	}

	if _, err := c.rw.Write(header); err != nil {
		return err
	}
	if _, err := c.rw.Write(payload); err != nil {
		return err
	}
	return c.rw.Flush()
}

func headerContainsToken(h http.Header, key, token string) bool {
	for _, part := range strings.Split(h.Get(key), ",") {
		if strings.EqualFold(strings.TrimSpace(part), token) {
			return true
		}
	}
	return false
}

func websocketAccept(key string) string {
	sum := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	return base64.StdEncoding.EncodeToString(sum[:])
}
