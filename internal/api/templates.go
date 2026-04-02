package api

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

type templateDescriptor struct {
	Name        string   `json:"name"`
	Path        string   `json:"path"`
	Files       []string `json:"files"`
	Description string   `json:"description,omitempty"`
}

func (s *Server) handleTemplates(w http.ResponseWriter, r *http.Request, user domain.User) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	templates, err := readTemplateDirectories(s.templatesRoot)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list templates failed")
		return
	}
	modules, err := readTemplateDirectories(s.modulesRoot)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list template modules failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"viewer":           user,
		"templates_root":   s.templatesRoot,
		"modules_root":     s.modulesRoot,
		"environment_sets": templates,
		"modules":          modules,
	})
}

func readTemplateDirectories(root string) ([]templateDescriptor, error) {
	if root == "" {
		return []templateDescriptor{}, nil
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}
	out := make([]templateDescriptor, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dir := filepath.Join(root, entry.Name())
		files, err := os.ReadDir(dir)
		if err != nil {
			return nil, err
		}
		names := make([]string, 0, len(files))
		for _, file := range files {
			names = append(names, file.Name())
		}
		sort.Strings(names)
		out = append(out, templateDescriptor{
			Name:  entry.Name(),
			Path:  dir,
			Files: names,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Name < out[j].Name
	})
	return out, nil
}
