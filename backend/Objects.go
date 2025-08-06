package backend

import "github.com/gorilla/websocket"

type Post struct {
	ID        int    `json:"id"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	Category  string `json:"category"`
	CreatedAt string `json:"created_at"`
	Author    string `json:"author"`
}

type Notification struct {
	ID       int    `json:"id"`
	Receiver string `json:"receiver_nickname"`
	Sender   string `json:"sender_nickname"`
	Unread   *int    `json:"unread_messages"`
}

type Comment struct {
	ID        int    `json:"id"`
	PostID    int    `json:"post_id"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
	Author    string `json:"author"`
}

type Message struct {
	From      string `json:"from"`
	To        string `json:"to"`
	Content   string `json:"content"`
	Timestamp string `json:"timestamp"`
}

type TypingIndicator struct {
	Type     string `json:"type"`
	From     string `json:"from"`
	To       string `json:"to"`
	IsTyping bool   `json:"isTyping"`
}

type Client struct {
	ID       string          `json:"id"` // Added ID field
	Conn     *websocket.Conn `json:"-"`  // Added json:"-" to exclude from JSON
	Username string          `json:"username"`
}

type User struct {
	ID        int    `json:"id"`
	Nickname  string `json:"nickname"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email"`
	Password  string `json:"password"`
	Age       int    `json:"age"`
	Gender    string `json:"gender"`
}

type LoginUser struct {
	Identifier string `json:"identifier"`
	Password   string `json:"password"`
}

type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}