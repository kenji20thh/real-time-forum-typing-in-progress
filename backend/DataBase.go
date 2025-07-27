package backend

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/mattn/go-sqlite3"
)

func MakeDataBase() {
	db, err := sql.Open("sqlite3", "database/forum.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	table, err := createTables(db)
	if err != nil {
		log.Fatalf("Failed to create tables in %d: %v ", table, err)
	}

	fmt.Println("Database and tables created successfully!")
}

func createTables(db *sql.DB) (int, error) {
	tables := []string{
		`CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		nickname TEXT UNIQUE,
		first_name TEXT,
		last_name TEXT,
		email TEXT UNIQUE,
		password TEXT,
		age INTEGER PRIMARY KEY,
		gender TEXT
	)`,
		`CREATE TABLE IF NOT EXISTS posts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER,
		title TEXT,
		content TEXT,
		category TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(user_id) REFERENCES users(id)
	)`,

		`CREATE TABLE IF NOT EXISTS comments (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		post_id INTEGER,
		user_id INTEGER,
		content TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(post_id) REFERENCES posts(id),
		FOREIGN KEY(user_id) REFERENCES users(id)
	)`,

		`CREATE TABLE IF NOT EXISTS messages (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	sender TEXT,
	receiver TEXT,
	content TEXT,
	timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
	)`,
		`CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    nickname TEXT,
    expires_at DATETIME,
    FOREIGN KEY(nickname) REFERENCES users(nickname)
	)`}

	for i := 0; i < len(tables); i++ {
		_, err := db.Exec(tables[i])
		if err != nil {
			return i + 1, err
		}
	}
	return 0, nil
}
