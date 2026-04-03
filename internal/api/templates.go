package api

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

type templateDescriptor struct {
	Name        string   `json:"name"`
	Path        string   `json:"path"`
	Files       []string `json:"files"`
	Description string   `json:"description,omitempty"`
}

type templateValidationResult struct {
	Kind         string   `json:"kind"`
	Name         string   `json:"name"`
	Path         string   `json:"path"`
	Files        []string `json:"files"`
	Required     []string `json:"required_files"`
	Missing      []string `json:"missing_files"`
	Warnings     []string `json:"warnings"`
	Valid        bool     `json:"valid"`
	Description  string   `json:"description,omitempty"`
	ReadmeExists bool     `json:"readme_exists"`
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

func (s *Server) handleTemplateRoute(w http.ResponseWriter, r *http.Request, _ domain.User) {
	path := strings.TrimPrefix(r.URL.Path, "/api/templates/")
	path = strings.Trim(path, "/")
	if path == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	parts := strings.Split(path, "/")
	if len(parts) < 2 || len(parts) > 3 {
		writeError(w, http.StatusNotFound, "template route not found")
		return
	}

	kind := parts[0]
	name := parts[1]
	if name == "" {
		writeError(w, http.StatusBadRequest, "template name is required")
		return
	}
	if len(parts) == 3 && parts[2] != "validate" {
		writeError(w, http.StatusNotFound, "template route not found")
		return
	}

	desc, validation, err := s.inspectTemplate(kind, name)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			writeError(w, http.StatusNotFound, "template not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "inspect template failed")
		return
	}

	switch {
	case len(parts) == 2 && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{
			"descriptor": desc,
			"validation": validation,
		})
	case len(parts) == 3 && parts[2] == "validate" && r.Method == http.MethodPost:
		writeJSON(w, http.StatusOK, validation)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) inspectTemplate(kind string, name string) (templateDescriptor, templateValidationResult, error) {
	root, requiredFiles, description, err := s.templateRootForKind(kind)
	if err != nil {
		return templateDescriptor{}, templateValidationResult{}, err
	}
	dir := filepath.Join(root, name)
	files, err := os.ReadDir(dir)
	if err != nil {
		return templateDescriptor{}, templateValidationResult{}, err
	}

	names := make([]string, 0, len(files))
	fileSet := make(map[string]struct{}, len(files))
	readmeExists := false
	for _, file := range files {
		names = append(names, file.Name())
		fileSet[file.Name()] = struct{}{}
		if strings.EqualFold(file.Name(), "README.md") {
			readmeExists = true
		}
	}
	sort.Strings(names)

	missing := make([]string, 0, len(requiredFiles))
	for _, file := range requiredFiles {
		if _, ok := fileSet[file]; !ok {
			missing = append(missing, file)
		}
	}

	warnings := make([]string, 0, 2)
	if !readmeExists {
		warnings = append(warnings, "README.md is missing, so operator guidance is reduced.")
	}
	if _, ok := fileSet["terraform.tfvars.json.example"]; kind == "environment" && !ok {
		warnings = append(warnings, "terraform.tfvars.json.example is missing, so local smoke testing guidance is incomplete.")
	}

	desc := templateDescriptor{
		Name:        name,
		Path:        dir,
		Files:       names,
		Description: description,
	}
	return desc, templateValidationResult{
		Kind:         kind,
		Name:         name,
		Path:         dir,
		Files:        names,
		Required:     requiredFiles,
		Missing:      missing,
		Warnings:     warnings,
		Valid:        len(missing) == 0,
		Description:  description,
		ReadmeExists: readmeExists,
	}, nil
}

func (s *Server) templateRootForKind(kind string) (string, []string, string, error) {
	switch kind {
	case "environment":
		return s.templatesRoot, []string{"main.tf", "variables.tf", "outputs.tf", "versions.tf"}, "Root environment template used by create, update, and destroy plans.", nil
	case "module":
		return s.modulesRoot, []string{"main.tf", "variables.tf", "outputs.tf"}, "Reusable module rendered under the selected environment template.", nil
	default:
		return "", nil, "", errors.New("unsupported template kind")
	}
}

func readTemplateDirectories(root string) ([]templateDescriptor, error) {
	if root == "" {
		return []templateDescriptor{}, nil
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []templateDescriptor{}, nil
		}
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
