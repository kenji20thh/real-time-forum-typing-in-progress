import { showSection } from './app.js';

const unreadCounts = new Map() // Messages unread
const chatCache = new Map() // Cache messages per user
let socket = null //Websocket connection
let selectedUser = null // Active chat now
let currentUser = null // Logged username

let chatPage = 0
const messagePerPage = 10
let isFetching = false
let noMoreMessages = false
let chatContainer = null


// throttle function with func and wait time as args
const throttle = (fn, wait) => {
  let lastTime = 0
  return function (...args) {
    const now = new Date().getTime()
    if (now - lastTime >= wait) {
      lastTime = now
      fn.apply(this, args)
    }
  }
}

async function loadMessagesPage(from, to, page) {
  const offset = page * messagePerPage
  const loader = document.getElementById("chatLoader")
  const minDisplayTime = 500 // milliseconds
  const start = Date.now()
  if (loader) loader.classList.remove("hidden")

  try {
    const res = await fetch(`/messages?from=${from}&to=${to}&offset=${offset}`)
    if (!res.ok) throw new Error("Failed to load chat messages")
    const messages = await res.json()
    if (messages.length === 0) {
      noMoreMessages = true
    } else {
      const container = document.getElementById("chatMessages")
      const oldScrollHeight = container.scrollHeight
      messages.reverse().forEach(msg => renderMessageAtTop(msg))
      container.scrollTop = container.scrollHeight - oldScrollHeight
      const cached = chatCache.get(to) || [];
      chatCache.set(to, [...messages, ...cached])
    }
  } catch (err) {
    console.error("Pagination error:", err)
  } finally {
    const timeElapsed = Date.now() - start
    const remainingTime = minDisplayTime - timeElapsed

    // wait remaining time if too fast
    setTimeout(() => {
      if (loader) loader.classList.add("hidden")
      isFetching = false
    }, remainingTime > 0 ? remainingTime : 0)
  }
}

// loading old msg when scroll up 
const renderMessageAtTop = (msg) => {
  const container = document.getElementById("chatMessages")
  const div = document.createElement("div")
  div.innerHTML = `
    <p><strong>${msg.from}</strong>: ${msg.content}<br/>
    <small>${new Date(msg.timestamp).toLocaleTimeString()}</small></p>
  `;
  container.insertBefore(div, container.firstChild)
}

// real time connexion using websockets, listens for msg, update
export function startChatFeature(currentUsername) {
  currentUser = currentUsername
  socket = new WebSocket("ws://" + window.location.host + "/ws");
  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data)
    if (data.type === "user_list") {
      setUserList(data.users)
    } else {
      if (data.from === selectedUser || data.to === selectedUser) {
        renderMessage(data)
        // update cache
        const chatKey = data.from === currentUser ? data.to : data.from
        const cached = chatCache.get(chatKey) || []
        chatCache.set(chatKey, [...cached, data])
      } else if (data.to === currentUser) {
        const prev = unreadCounts.get(data.from) || 0
        unreadCounts.set(data.from, prev + 1)
        updateNotificationBadge(data.from)
      }
    }
  })

  const sendBtn = document.getElementById("sendBtn")
  const input = document.getElementById("messageInput")

  if (sendBtn && input) {
    sendBtn.addEventListener("click", () => {
      const content = input.value.trim()
      if (!content || !selectedUser) return

      const message = {
        to: selectedUser,
        from: currentUser,
        content: content,
        timestamp: new Date().toISOString(),
      }

      socket.send(JSON.stringify(message))
      renderMessage(message)

      // Update cache
      const cached = chatCache.get(selectedUser) || []
      chatCache.set(selectedUser, [...cached, message])
      input.value = ""
    })
  }
}

function renderMessage(msg) {
  const container = document.getElementById("chatMessages")
  const div = document.createElement("div")
  div.innerHTML = `
    <p><strong>${msg.from}</strong>: ${msg.content}<br/>
    <small>${new Date(msg.timestamp).toLocaleTimeString()}</small></p>
  `;
  container.appendChild(div)
  container.scrollTop = container.scrollHeight
}

function setUserList(users) {
  const list = document.getElementById("userList")
  list.innerHTML = ""
  users.forEach((username) => {
    if (username === currentUser) return

    const div = document.createElement("div")
    div.className = "user"
    div.style.display = "flex"
    div.style.justifyContent = "space-between"
    div.style.alignItems = "center"
    div.style.cursor = "pointer"
    div.style.padding = "5px"
    div.style.borderBottom = "1px solid #ddd"
    const nameSpan = document.createElement("span")
    nameSpan.textContent = username
    const statusSpan = document.createElement("span")
    statusSpan.classList.add("status", "online")

    div.appendChild(nameSpan)
    div.appendChild(statusSpan)

    div.addEventListener("click", async () => {
      chatPage = 0
      noMoreMessages = false
      chatContainer = document.getElementById("chatMessages")

      chatContainer.addEventListener("scroll", throttle(async () => {
        if (chatContainer.scrollTop < 50 && !isFetching && !noMoreMessages) {
          isFetching = true
          chatPage += 1
          await loadMessagesPage(currentUser, selectedUser, chatPage)
        }
      }, 300))

      selectedUser = username
      document.getElementById("chatWithName").textContent = username
      document.getElementById("chatWindow").classList.remove("hidden")
      document.getElementById("chatMessages").innerHTML = ""

      unreadCounts.set(username, 0)
      const badge = div.querySelector(".notification-badge")
      if (badge) badge.remove()

      // Close chat button 
      const closeChatBtn = document.getElementById("closeChatBtn")
      if (closeChatBtn) {
        closeChatBtn.onclick = () => {
          document.getElementById("chatWindow").classList.add("hidden")
          selectedUser = null;
          document.getElementById("chatWithName").textContent = ""
        };
      }

      // Load from cache or fetch
      const cachedMessages = chatCache.get(username)
      if (cachedMessages) {
        cachedMessages.forEach(renderMessage)
      } else {
        try {
          chatPage = 0
          noMoreMessages = false
          const res = await fetch(`/messages?from=${currentUser}&to=${selectedUser}&offset=0`)
          if (!res.ok) throw new Error("Failed to load chat history")
          const messages = await res.json()
          chatCache.set(selectedUser, messages)
          messages.forEach(renderMessage)
        } catch (err) {
          console.error("Chat history error:", err)
        }
      }
    });

    list.appendChild(div)
  });
}

function updateNotificationBadge(fromUser) {
  const userList = document.getElementById("userList");
  const users = userList.getElementsByClassName("user");

  for (let div of users) {
    const nameSpan = div.querySelector("span:first-child");
    if (nameSpan && nameSpan.textContent === fromUser) {
      let badge = div.querySelector(".notification-badge");

      if (!badge) {
        badge = document.createElement("span");
        badge.classList.add("notification-badge");
        div.appendChild(badge);
      }

      badge.textContent = unreadCounts.get(fromUser);
    }
  }

}