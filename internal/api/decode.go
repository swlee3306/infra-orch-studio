package api

import (
	"encoding/json"
	"io"
)

func decodeJSON(r io.Reader, out any) error {
	dec := json.NewDecoder(r)
	dec.DisallowUnknownFields()
	return dec.Decode(out)
}
