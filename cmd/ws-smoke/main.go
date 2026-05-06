package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha1"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"strings"
	"time"
)

func main() {
	apiBase := flag.String("api-base", env("API_BASE", "http://localhost:8080/api"), "API base URL")
	email := flag.String("email", env("ADMIN_EMAIL", ""), "login email")
	password := flag.String("password", env("ADMIN_PASSWORD", ""), "login password")
	jobID := flag.String("job-id", env("JOB_ID", ""), "job id to subscribe")
	timeout := flag.Duration("timeout", 10*time.Second, "smoke timeout")
	requiredEvent := flag.String("required-event", env("REQUIRED_EVENT", "any"), "event type required for success: any, status, or log")
	flag.Parse()

	emailValue := strings.TrimSpace(*email)
	jobIDValue := strings.TrimSpace(*jobID)
	requiredEventValue, err := normalizeRequiredEvent(*requiredEvent)
	if err != nil {
		log.Fatal(err)
	}
	if emailValue == "" || *password == "" || jobIDValue == "" {
		log.Fatal("ADMIN_EMAIL, ADMIN_PASSWORD, and JOB_ID are required")
	}
	normalizedAPIBase, err := normalizeAPIBase(*apiBase)
	if err != nil {
		log.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()

	client, err := login(ctx, normalizedAPIBase, emailValue, *password)
	if err != nil {
		log.Fatalf("login: %v", err)
	}
	if err := subscribeOnce(ctx, client, normalizedAPIBase, jobIDValue, requiredEventValue); err != nil {
		log.Fatalf("websocket smoke: %v", err)
	}
	log.Printf("websocket smoke ok job_id=%s required_event=%s", jobIDValue, requiredEventValue)
}

func normalizeAPIBase(apiBase string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(apiBase))
	if err != nil {
		return "", err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("api-base must use http or https")
	}
	if u.Host == "" {
		return "", fmt.Errorf("api-base must include a host")
	}
	u.Path = strings.TrimRight(u.Path, "/")
	if u.Path != "/api" {
		return "", fmt.Errorf("api-base must end with /api")
	}
	u.RawQuery = ""
	u.Fragment = ""
	return u.String(), nil
}

func normalizeRequiredEvent(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		value = "any"
	}
	if value != "any" && value != "status" && value != "log" {
		return "", fmt.Errorf("required-event must be any, status, or log")
	}
	return value, nil
}

func login(ctx context.Context, apiBase, email, password string) (*http.Client, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Jar: jar}
	payload, _ := json.Marshal(map[string]string{"email": email, "password": password})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(apiBase, "/")+"/auth/login", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/json")
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return nil, fmt.Errorf("status=%d body=%s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	return client, nil
}

func subscribeOnce(ctx context.Context, client *http.Client, apiBase, jobID, requiredEvent string) error {
	wsURL, err := websocketURL(apiBase)
	if err != nil {
		return err
	}
	conn, rw, err := dialWebSocket(ctx, client, wsURL)
	if err != nil {
		return err
	}
	defer conn.Close()

	payload, _ := json.Marshal(map[string]string{"type": "subscribe", "jobId": jobID})
	if err := writeClientTextFrame(rw, payload); err != nil {
		return err
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		frame, err := readServerTextFrame(rw)
		if err != nil {
			return err
		}
		var msg struct {
			Type  string `json:"type"`
			JobID string `json:"jobId"`
		}
		if err := json.Unmarshal(frame, &msg); err != nil {
			return fmt.Errorf("decode frame %q: %w", string(frame), err)
		}
		fmt.Println(string(frame))
		if msg.JobID == jobID && (requiredEvent == "any" && (msg.Type == "status" || msg.Type == "log") || msg.Type == requiredEvent) {
			return nil
		}
	}
}

func websocketURL(apiBase string) (*url.URL, error) {
	u, err := url.Parse(apiBase)
	if err != nil {
		return nil, err
	}
	if u.Scheme == "https" {
		u.Scheme = "wss"
	} else {
		u.Scheme = "ws"
	}
	u.Path = "/ws"
	u.RawQuery = ""
	return u, nil
}

func dialWebSocket(ctx context.Context, client *http.Client, wsURL *url.URL) (net.Conn, *bufio.ReadWriter, error) {
	host := wsURL.Host
	address := host
	if !strings.Contains(host, ":") {
		if wsURL.Scheme == "wss" {
			address = host + ":443"
		} else {
			address = host + ":80"
		}
	}

	var d net.Dialer
	conn, err := d.DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, nil, err
	}
	if wsURL.Scheme == "wss" {
		tlsConn := tls.Client(conn, &tls.Config{ServerName: wsURL.Hostname(), MinVersion: tls.VersionTLS12})
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			_ = conn.Close()
			return nil, nil, err
		}
		conn = tlsConn
	}

	keyBytes := make([]byte, 16)
	if _, err := rand.Read(keyBytes); err != nil {
		_ = conn.Close()
		return nil, nil, err
	}
	key := base64.StdEncoding.EncodeToString(keyBytes)
	cookieHeader := cookiesFor(client, wsURL)

	rw := bufio.NewReadWriter(bufio.NewReader(conn), bufio.NewWriter(conn))
	request := "GET /ws HTTP/1.1\r\n" +
		"Host: " + host + "\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Version: 13\r\n" +
		"Sec-WebSocket-Key: " + key + "\r\n"
	if cookieHeader != "" {
		request += "Cookie: " + cookieHeader + "\r\n"
	}
	request += "\r\n"
	if _, err := rw.WriteString(request); err != nil {
		_ = conn.Close()
		return nil, nil, err
	}
	if err := rw.Flush(); err != nil {
		_ = conn.Close()
		return nil, nil, err
	}

	status, err := rw.ReadString('\n')
	if err != nil {
		_ = conn.Close()
		return nil, nil, err
	}
	if !strings.Contains(status, " 101 ") {
		_ = conn.Close()
		return nil, nil, fmt.Errorf("websocket upgrade failed: %s", strings.TrimSpace(status))
	}
	headers := http.Header{}
	for {
		line, err := rw.ReadString('\n')
		if err != nil {
			_ = conn.Close()
			return nil, nil, err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			break
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) == 2 {
			headers.Add(strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]))
		}
	}
	if got := headers.Get("Sec-WebSocket-Accept"); got != websocketAccept(key) {
		_ = conn.Close()
		return nil, nil, fmt.Errorf("unexpected websocket accept header")
	}
	return conn, rw, nil
}

func cookiesFor(client *http.Client, wsURL *url.URL) string {
	if client.Jar == nil {
		return ""
	}
	httpURL := *wsURL
	if httpURL.Scheme == "wss" {
		httpURL.Scheme = "https"
	} else {
		httpURL.Scheme = "http"
	}
	var parts []string
	for _, c := range client.Jar.Cookies(&httpURL) {
		parts = append(parts, c.Name+"="+c.Value)
	}
	return strings.Join(parts, "; ")
}

func writeClientTextFrame(rw *bufio.ReadWriter, payload []byte) error {
	mask := make([]byte, 4)
	if _, err := rand.Read(mask); err != nil {
		return err
	}
	header := []byte{0x81}
	switch n := len(payload); {
	case n < 126:
		header = append(header, byte(n)|0x80)
	case n <= 65535:
		header = append(header, 126|0x80, 0, 0)
		binary.BigEndian.PutUint16(header[2:], uint16(n))
	default:
		return errors.New("payload too large")
	}
	masked := make([]byte, len(payload))
	for i := range payload {
		masked[i] = payload[i] ^ mask[i%4]
	}
	if _, err := rw.Write(header); err != nil {
		return err
	}
	if _, err := rw.Write(mask); err != nil {
		return err
	}
	if _, err := rw.Write(masked); err != nil {
		return err
	}
	return rw.Flush()
}

func readServerTextFrame(rw *bufio.ReadWriter) ([]byte, error) {
	header := make([]byte, 2)
	if _, err := io.ReadFull(rw, header); err != nil {
		return nil, err
	}
	opcode := header[0] & 0x0f
	if opcode == 0x8 {
		return nil, io.EOF
	}
	if opcode != 0x1 {
		return nil, fmt.Errorf("unexpected websocket opcode %d", opcode)
	}
	length := uint64(header[1] & 0x7f)
	switch length {
	case 126:
		ext := make([]byte, 2)
		if _, err := io.ReadFull(rw, ext); err != nil {
			return nil, err
		}
		length = uint64(binary.BigEndian.Uint16(ext))
	case 127:
		ext := make([]byte, 8)
		if _, err := io.ReadFull(rw, ext); err != nil {
			return nil, err
		}
		length = binary.BigEndian.Uint64(ext)
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(rw, payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func websocketAccept(key string) string {
	sum := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	return base64.StdEncoding.EncodeToString(sum[:])
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
