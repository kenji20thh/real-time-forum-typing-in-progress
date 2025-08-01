package backend

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/twinj/uuid"
)

func (S *Server) RegisterHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		renderErrorPage(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var user User
	err := json.NewDecoder(r.Body).Decode(&user)
	if err != nil {
		renderErrorPage(w, "Bad Request", http.StatusBadRequest)
		return
	}

	err, found := S.UserFound(user)
	if err != nil {
		renderErrorPage(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	if found {
		renderErrorPage(w, "Status Conflict", http.StatusConflict)
		return
	}

	Err := S.AddUser(user)
	if Err != "" {
		renderErrorPage(w, Err, http.StatusInternalServerError)
		return
	}
}

func (S *Server) LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		renderErrorPage(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var user LoginUser
	err := json.NewDecoder(r.Body).Decode(&user)
	if err != nil {
		renderErrorPage(w, "Bad Request", http.StatusBadRequest)
		return
	}

	// fmt.Println(user)

	nickname, hashedPassword, err := S.GetHashedPasswordFromDB(user.Identifier)
	if err != nil {
		fmt.Println("undif")
		return
	}

	if err := CheckPassword(hashedPassword, user.Password); err != nil {
		fmt.Println("err")
		renderErrorPage(w, "Inccorect password", http.StatusInternalServerError)
		return
	}

	S.MakeToken(w, nickname)

	w.Header().Set("Content-Type", "application/json")
	//fmt.Fprintf(w, `{"username":"%s"}`, nickname)
	json.NewEncoder(w).Encode(map[string]string{
		"username": nickname,
	})
}

func (S *Server) CreatePostHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session_token")
	if err != nil {
		http.Error(w, "Unauthorized - No session", http.StatusUnauthorized)
		return
	}

	sessionID := cookie.Value
	var nickname string
	err = S.db.QueryRow("SELECT nickname FROM sessions WHERE session_id = ? AND expires_at > datetime('now')", sessionID).Scan(&nickname)
	if err != nil {
		http.Error(w, "Unauthorized - Invalid session", http.StatusUnauthorized)
		return
	}

	var post Post

	err = json.NewDecoder(r.Body).Decode(&post)
	if err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	_, err = S.db.Exec(
		"INSERT INTO posts (user_id, title, content, category) VALUES ((SELECT id FROM users WHERE nickname = ?), ?, ?, ?)",
		nickname, post.Title, post.Content, post.Category,
	)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func (S *Server) GetPostsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := S.db.Query(`
        SELECT posts.id, posts.title, posts.content, posts.category, posts.created_at, users.nickname
        FROM posts
        JOIN users ON posts.user_id = users.id
        ORDER BY posts.created_at DESC
    `)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var posts []Post
	for rows.Next() {
		var p Post
		err := rows.Scan(&p.ID, &p.Title, &p.Content, &p.Category, &p.CreatedAt, &p.Author)
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		posts = append(posts, p)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(posts)
}

func (S *Server) LogoutHandler(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_token")
	if err != nil {
		http.Error(w, "No session", http.StatusBadRequest)
		return
	}

	_, err = S.db.Exec("DELETE FROM sessions WHERE session_id = ?", cookie.Value)
	if err != nil {
		http.Error(w, "Error deleting session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:    "session_token",
		Value:   "",
		Expires: time.Unix(0, 0),
		Path:    "/",
	})

	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func (S *Server) LoggedHandler(w http.ResponseWriter, r *http.Request) {
	username, err := S.CheckSession(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	// fmt.Fprintf(w, `{"username":"%s"}`, username)
	json.NewEncoder(w).Encode(map[string]string{
		"username": username,
	})
}

// comments

func (S *Server) CreateCommentHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	cookie, err := r.Cookie("session_token")
	if err != nil {
		http.Error(w, "Unauthorized - No session", http.StatusUnauthorized)
		return
	}
	sessionID := cookie.Value
	var nickname string
	err = S.db.QueryRow("SELECT nickname FROM sessions WHERE session_id = ? AND expires_at > datetime('now')", sessionID).Scan(&nickname)
	if err != nil {
		http.Error(w, "Unauthorized - Invalid session", http.StatusUnauthorized)
		return
	}
	var comment Comment
	err = json.NewDecoder(r.Body).Decode(&comment)
	if err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	_, err = S.db.Exec(
		"INSERT INTO comments (post_id, user_id, content) VALUES (?, (SELECT id FROM users WHERE nickname = ?), ?)",
		comment.PostID, nickname, comment.Content,
	)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func (S *Server) GetCommentsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	postID := r.URL.Query().Get("post_id")
	if postID == "" {
		http.Error(w, "Missing post_id parameter", http.StatusBadRequest)
		return
	}
	rows, err := S.db.Query(`
        SELECT comments.id, comments.content, comments.created_at, users.nickname
        FROM comments
        JOIN users ON comments.user_id = users.id
        WHERE comments.post_id = ?
        ORDER BY comments.created_at ASC
    `, postID)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var comments []Comment
	for rows.Next() {
		var c Comment
		err := rows.Scan(&c.ID, &c.Content, &c.CreatedAt, &c.Author)
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		comments = append(comments, c)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(comments)
}

// chats

// Modified HandleWebSocket function
func (S *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	username, err := S.CheckSession(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := S.upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println("WebSocket Upgrade Error:", err)
		return
	}

	client := &Client{
		ID:       uuid.NewV4().String(), // Generate unique ID
		Conn:     conn,
		Username: username,
	}

	// Add client to the user's session list
	if S.clients[username] == nil {
		S.clients[username] = []*Client{}
	}
	S.clients[username] = append(S.clients[username], client)

	fmt.Println(username, "connected to WebSocket")

	S.broadcastUserList("")

	go S.receiveMessages(client)
}

func (s *Server) GetMessagesHandler(w http.ResponseWriter, r *http.Request) {
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")

	if from == "" || to == "" {
		http.Error(w, "Missing parameters", http.StatusBadRequest)
		return
	}

	offsetStr := r.URL.Query().Get("offset")
	offset, err := strconv.Atoi(offsetStr)
	if err != nil {
		offset = 0
	}

	rows, err := s.db.Query(`
	SELECT sender, receiver, content, timestamp
	FROM messages
	WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
	ORDER BY timestamp DESC
	LIMIT 10 OFFSET ?
`, from, to, to, from, offset)

	if err != nil {
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var msg Message
		err := rows.Scan(&msg.From, &msg.To, &msg.Content, &msg.Timestamp)
		if err != nil {
			http.Error(w, "Scan error", http.StatusInternalServerError)
			return
		}
		messages = append([]Message{msg}, messages...)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}
