package backend

import (
	"context"
	"database/sql"
	"fmt"
	"html"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/twinj/uuid"
	"golang.org/x/crypto/bcrypt"
)

type Server struct {
	db       *sql.DB
	Mux      *http.ServeMux
	clients  map[string][]*Client // Changed: map username to slice of clients
	upgrader websocket.Upgrader
}

func (S *Server) Run(port string) {
	S.Mux = http.NewServeMux()
	S.DataBase()
	S.initRoutes()

	S.clients = make(map[string][]*Client) // Updated initialization

	fmt.Println("Server running on http://localhost:" + port)
	err := http.ListenAndServe(":"+port, S.Mux)
	if err != nil {
		log.Println("Server error:", err)
		return
	}
}

func (S *Server) initRoutes() {
	S.Mux.Handle("/", http.FileServer(http.Dir("./static")))
	S.Mux.HandleFunc("/logged", S.LoggedHandler)

	S.Mux.HandleFunc("/notification", S.Notification)

	S.Mux.Handle("/createPost", S.SessionMiddleware(http.HandlerFunc(S.CreatePostHandler)))
	S.Mux.HandleFunc("/posts", S.GetPostsHandler)

	S.Mux.Handle("/createComment", S.SessionMiddleware(http.HandlerFunc(S.CreateCommentHandler)))
	S.Mux.HandleFunc("/comments", S.GetCommentsHandler)

	S.Mux.HandleFunc("/register", S.RegisterHandler)
	S.Mux.HandleFunc("/login", S.LoginHandler)

	S.Mux.HandleFunc("/ws", S.HandleWebSocket)
	S.Mux.HandleFunc("/messages", S.GetMessagesHandler)

	S.Mux.HandleFunc("/logout", S.LogoutHandler)
}

func (S *Server) UserFound(user User) (error, bool) {
	var exists int
	err := S.db.QueryRow("SELECT COUNT(*) FROM users WHERE email = ? OR nickname = ?", user.Email, user.Nickname).Scan(&exists)
	if err != nil {
		return err, false
	}
	if exists > 0 {
		return nil, true
	}
	return nil, false
}

func (S *Server) AddUser(user User) string {
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	if err != nil {
		return "hash Password Error"
	}
	query := `INSERT INTO users (nickname, first_name, last_name, email, password, age, gender)
		VALUES (?, ?, ?, ?, ?, ?, ?)`
	_, err = S.db.Exec(query, html.EscapeString(user.Nickname), html.EscapeString(user.FirstName), html.EscapeString(user.LastName), html.EscapeString(user.Email), string(hashedPassword), user.Age, user.Gender)
	if err != nil {
		return error.Error(err)
	}
	return ""
}

func (S *Server) SessionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		username, err := S.CheckSession(r)
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), "username", username)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (S *Server) CheckSession(r *http.Request) (string, error) {
	cookie, err := r.Cookie("session_token")
	if err != nil {
		return "", fmt.Errorf("no session cookie")
	}
	sessionID := cookie.Value

	var username string
	err = S.db.QueryRow(`
        SELECT nickname FROM sessions 
        WHERE session_id = ? AND expires_at > CURRENT_TIMESTAMP
    `, sessionID).Scan(&username)

	if err != nil {
		return "", fmt.Errorf("invalid or expired session")
	}

	return username, nil
}

func (S *Server) MakeToken(Writer http.ResponseWriter, username string) {
	sessionID := uuid.NewV4().String()
	expirationTime := time.Now().Add(24 * time.Hour)

	_, err := S.db.Exec("INSERT INTO sessions (session_id, nickname, expires_at) VALUES (?, ?, ?)",
		sessionID, username, expirationTime)
	if err != nil {
		http.Error(Writer, "Error creating session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(Writer, &http.Cookie{
		Name:     "session_token",
		Value:    sessionID,
		Expires:  expirationTime,
		HttpOnly: true,
	})
}

func (S *Server) GetHashedPasswordFromDB(identifier string) (string, string, error) {
	var hashedPassword, nickname string

	err := S.db.QueryRow(`
		SELECT password, nickname FROM users 
		WHERE nickname = ? OR email = ?
	`, identifier, identifier).Scan(&nickname, &hashedPassword)

	if err != nil {
		if err == sql.ErrNoRows {
			return "", "", fmt.Errorf("this user does not exist")
		}
		return "", "", err
	}
	return hashedPassword, nickname, nil
}

// Modified receiveMessages function
func (s *Server) receiveMessages(client *Client) {
	defer func() {
		client.Conn.Close()

		// Remove this specific client from the user's session list
		if sessions, exists := s.clients[client.Username]; exists {
			for i, c := range sessions {
				if c.ID == client.ID {
					s.clients[client.Username] = append(sessions[:i], sessions[i+1:]...)
					break
				}
			}
			// If no more sessions for this user, remove the user entirely
			if len(s.clients[client.Username]) == 0 {
				delete(s.clients, client.Username)
			}
		}

		s.broadcastUserList("")
		fmt.Println(client.Username, "disconnected")
	}()

	for {
		var msg Message
		err := client.Conn.ReadJSON(&msg)
		if err != nil {
			fmt.Println("WebSocket Read Error:", err)
			break
		}

		msg.From = client.Username
		msg.Timestamp = time.Now().Format(time.RFC3339)

		_, err = s.db.Exec(`
			INSERT INTO messages (sender, receiver, content, timestamp)
			VALUES (?, ?, ?, ?)`,
			msg.From, msg.To, html.EscapeString(msg.Content), msg.Timestamp)
		if err != nil {
			fmt.Println("DB Insert Error:", err)
			continue
		}

		// Send to all sessions of the recipient
		if recipientSessions, ok := s.clients[msg.To]; ok {
			for _, recipient := range recipientSessions {
				s.broadcastUserList(msg.To)
				err := recipient.Conn.WriteJSON(msg)
				if err != nil {
					fmt.Println("Send Error to recipient:", err)
				}
			}
		}

		// Send to all other sessions of the sender (excluding current session)
		if senderSessions, ok := s.clients[msg.From]; ok {
			for _, senderClient := range senderSessions {
				if senderClient.ID != client.ID { // Don't send back to the same session
					err := senderClient.Conn.WriteJSON(msg)
					if err != nil {
						fmt.Println("Send Error to sender session:", err)
					}
				}
			}
		}
	}
}

// Modified broadcastUserList function
func (S *Server) broadcastUserList(lastsender string) {
	var usernames []string
	if lastsender != "" {
		usernames = append(usernames, lastsender)
	}

	for username := range S.clients {
		if lastsender != username {
			usernames = append(usernames, username)
		}
	}

	// Send to all client sessions
	for _, clientSessions := range S.clients {
		for _, client := range clientSessions {
			client.Conn.WriteJSON(map[string]interface{}{
				"type":  "user_list",
				"users": usernames,
			})
		}
	}
}

func (S *Server) DataBase() {
	var err error
	S.db, err = sql.Open("sqlite3", "database/forum.db")
	if err != nil {
		log.Fatal(err)
	}
}

func (S *Server) Shutdown() {
	S.db.Close()
}
