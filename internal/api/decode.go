package api

import (
	"encoding/json"
	"errors"
	"io"
)

func decodeJSON(r io.Reader, out any) error {
	dec := json.NewDecoder(r)
	dec.DisallowUnknownFields()
	if err := dec.Decode(out); err != nil {
		return err
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		if err == nil {
			return errors.New("invalid json")
		}
		return err
	}
	return nil
}
