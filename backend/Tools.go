package backend

import (
	"net/http"

	"golang.org/x/crypto/bcrypt"
)

type Error struct {
	Err       string
	ErrNumber string
}

func renderErrorPage(w http.ResponseWriter, errMsg string, errCode int) {
	http.Error(w, errMsg, errCode)
}

func CheckPassword(hashedPassword, password string) error {
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
	return err
}
