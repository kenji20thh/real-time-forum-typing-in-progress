package main

import (
	"real-time-forum/backend"
)

func main() {
	var Server backend.Server
	backend.MakeDataBase()
	Server.Run("8080")
	Server.Shutdown()
}
