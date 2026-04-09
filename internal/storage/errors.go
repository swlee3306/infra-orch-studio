package storage

import "errors"

var ErrConflict = errors.New("storage conflict")
var ErrNotFound = errors.New("storage not found")
