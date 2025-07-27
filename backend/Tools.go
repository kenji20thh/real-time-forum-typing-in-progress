package backend

import (
	"fmt"
	"html/template"
	"net/http"

	"golang.org/x/crypto/bcrypt"
)

type Error struct {
	Err       string
	ErrNumber string
}

func renderErrorPage(w http.ResponseWriter, errMsg string, errCode int) {
	var Err Error

	tmpl, tempErr := template.ParseFiles("templates/error.html")
	if tempErr != nil {
		http.Error(w, tempErr.Error(), http.StatusNotFound)
		return
	}
	Err = Error{Err: errMsg, ErrNumber: fmt.Sprintf("%d", errCode)}
	w.WriteHeader(errCode)
	err := tmpl.Execute(w, Err)
	if err != nil {
		http.Error(w, "Template error", http.StatusInternalServerError)
		return
	}
}

func CheckPassword(hashedPassword, password string) error {
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
	return err
}
