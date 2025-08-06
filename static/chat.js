import { logged, showSection } from './app.js';

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
let newMessages = 0

// Typing indicator variables
let typingTimeout = null
let isTyping = false
const TYPING_TIMEOUT = 3000 // Stop showing typing after 3 seconds of inactivity

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

// Debounce function for typing indicator
const debounce = (fn, delay) => {
  let timeoutId
  return function (...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), delay)
  }
}

async function loadMessagesPage(from, to, page) {
  const offset = displayedMessagesCount;
  const loader = document.getElementById("chatLoader");
  const minDisplayTime = 500; // milliseconds
  const start = Date.now();

  if (loader) loader.classList.remove("hidden");

  try {
    const res = await fetch(`/messages?from=${from}&to=${to}&offset=${offset}`);
    if (!res.ok) throw new Error("Failed to load chat messages");
    const messages = await res.json();
    if (messages.length === 0) {
      noMoreMessages = true;
      // Explicitly hide loader when no more messages
      if (loader) loader.classList.add("hidden");
      isFetching = false;
      return; // Exit early
    }

    const container = document.getElementById("chatMessages");
    const oldScrollHeight = container.scrollHeight;
    const oldScrollTop = container.scrollTop;
    const sortedMessages = messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    sortedMessages.reverse().forEach(msg => renderMessageAtTop(msg));
    
    displayedMessagesCount += messages.length;

    const newScrollHeight = container.scrollHeight;
    const heightDifference = newScrollHeight - oldScrollHeight;
    container.scrollTop = oldScrollTop + heightDifference;

    const cached = chatCache.get(to) || [];
    const chronologicalMessages = messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    chatCache.set(to, [...chronologicalMessages, ...cached]);
  } catch (err) {
    console.error("Pagination error:", err);
  } finally {
    const timeElapsed = Date.now() - start;
    const remainingTime = minDisplayTime - timeElapsed;

    setTimeout(() => {
      if (loader) loader.classList.add("hidden");
      isFetching = false;

      // Only dispatch scroll event if there are more messages to load
      if (!noMoreMessages) {
        const container = document.getElementById("chatMessages");
        if (container && container.scrollTop <= 100) {
          setTimeout(() => {
            if (container.scrollTop <= 100 && !isFetching && !noMoreMessages) {
              const event = new Event('scroll');
              container.dispatchEvent(event);
            }
          }, 100);
        }
      }
    }, remainingTime > 0 ? remainingTime : 0);
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

// Function to send typing status
function sendTypingStatus(isTypingNow) {
  if (!socket || !selectedUser) return
  
  const typingMessage = {
    type: 'typing',
    from: currentUser,
    to: selectedUser,
    isTyping: isTypingNow
  }
  
  socket.send(JSON.stringify(typingMessage))
}

// Function to show/hide typing indicator
function showTypingIndicator(username, show) {
  const container = document.getElementById("chatMessages")
  let typingIndicator = document.getElementById("typingIndicator")
  
  if (show && !typingIndicator) {
    typingIndicator = document.createElement("div")
    typingIndicator.id = "typingIndicator"
    typingIndicator.className = "typing-indicator"
    typingIndicator.innerHTML = `
      <p><em>${username} is typing</em>
        <span class="typing-dots">
          <span>.</span><span>.</span><span>.</span>
        </span>
      </p>
    `
    container.appendChild(typingIndicator)
    container.scrollTop = container.scrollHeight
  } else if (!show && typingIndicator) {
    typingIndicator.remove()
  }
}

// Function to show typing indicator in user list
function showTypingInUserList(username, show) {
  const userList = document.getElementById("userList")
  const users = userList.getElementsByClassName("user")
  
  for (let div of users) {
    const nameSpan = div.querySelector("span:first-child")
    if (nameSpan && nameSpan.textContent === username) {
      let typingBadge = div.querySelector(".typing-badge")
      
      if (show && !typingBadge) {
        typingBadge = document.createElement("span")
        typingBadge.classList.add("typing-badge")
        typingBadge.innerHTML = `
          <span class="typing-dots-small">
            <span>.</span><span>.</span><span>.</span>
          </span>
        `
        div.appendChild(typingBadge)
      } else if (!show && typingBadge) {
        typingBadge.remove()
      }
      break
    }
  }
}

// real time connexion using websockets, listens for msg, update
export function startChatFeature(currentUsername) {
  currentUser = currentUsername
  socket = new WebSocket("ws://" + window.location.host + "/ws")

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data)
    if (data.type === "user_list") {
      setUserList(data.users)
    } else if (data.type === "typing") {
      // Handle typing indicator
      if (data.from === selectedUser) {
        // Show in chat if chat is open with this user
        showTypingIndicator(data.from, data.isTyping)
      } else {
        // Show in user list if chat is closed or different user
        showTypingInUserList(data.from, data.isTyping)
      }
    } else {
      // Hide typing indicator when message is received
      if (data.from === selectedUser) {
        showTypingIndicator(data.from, false)
      }
      // Also hide from user list
      showTypingInUserList(data.from, false)
      
      newMessages++
      if (data.from === selectedUser || data.to === selectedUser) {
        renderMessage(data)
        const chatKey = data.from === currentUser ? data.to : data.from
        const cached = chatCache.get(chatKey) || []
        chatCache.set(chatKey, [...cached, data])
      } else if (data.to === currentUser) {
        notification(data.to, data.from,1)
      }
    }
  })

  const sendBtn = document.getElementById("sendBtn")
  const input = document.getElementById("messageInput")
  if (sendBtn && input) {
    
    // Add typing event listeners
    const handleTyping = debounce(() => {
      if (isTyping) {
        isTyping = false
        sendTypingStatus(false)
      }
    }, 1000) // Stop typing after 1 second of inactivity

    input.addEventListener('input', () => {
      if (!isTyping && input.value.trim().length > 0) {
        isTyping = true
        sendTypingStatus(true)
      } else if (isTyping && input.value.trim().length === 0) {
        isTyping = false
        sendTypingStatus(false)
        return
      }
      
      if (input.value.trim().length > 0) {
        handleTyping()
      }
    })

    // Stop typing on blur
    input.addEventListener('blur', () => {
      if (isTyping) {
        isTyping = false
        sendTypingStatus(false)
      }
    })

    const sendMessage = () => {
      // Stop typing indicator when sending
      if (isTyping) {
        isTyping = false
        sendTypingStatus(false)
      }
      
      fetch('/logged', {
        credentials: 'include'
      })
        .then(res => {
          if (!res.ok) throw new Error('Not logged in')
          return res.json()
        })
        .then(() => {
          const content = input.value.trim();
          if (!content || !selectedUser) return;

          const message = {
            to: selectedUser,
            from: currentUser,
            content: content,
            timestamp: new Date().toISOString(),
          }
          socket.send(JSON.stringify(message))
          renderMessage(message)
          const cached = chatCache.get(selectedUser) || []
          chatCache.set(selectedUser, [...cached, message])
          input.value = ""
        })
        .catch(() => {
          logged(false)
          showSection('loginSection')
          document.getElementById("chatWindow").classList.add('hidden')
        })
    }
    
    sendBtn.addEventListener("click", sendMessage);
    
    // Send on Enter key
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage()
      }
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
    notification(currentUser, username)
    div.addEventListener("click", async () => {
      // Reset typing status when switching chats
      if (isTyping) {
        isTyping = false
        sendTypingStatus(false)
      }
      
      chatPage = 0
      noMoreMessages = false
      chatContainer = document.getElementById("chatMessages")
      const existingHandler = chatContainer.scrollHandler
      if (existingHandler) {
        chatContainer.removeEventListener("scroll", existingHandler)
      }

      const scrollHandler = throttle(async () => {
        const isNearTop = chatContainer.scrollTop <= 100
        const isAtTop = chatContainer.scrollTop === 0

        if ((isNearTop || isAtTop) && !isFetching && !noMoreMessages) {
          isFetching = true
          chatPage += 1
          await loadMessagesPage(currentUser, selectedUser, chatPage)
        }
      }, 200)
      chatContainer.scrollHandler = scrollHandler
      chatContainer.addEventListener("scroll", scrollHandler)
      selectedUser = username
      document.getElementById("chatWithName").textContent = username
      document.getElementById("chatWindow").classList.remove("hidden")
      document.getElementById("chatMessages").innerHTML = ""

      const badge = div.querySelector(".notification-badge")
      if (badge) badge.remove()
      
      // Remove typing indicator from user list when opening chat
      const typingBadge = div.querySelector(".typing-badge")
      if (typingBadge) typingBadge.remove()

      // close chat button 
      const closeChatBtn = document.getElementById("closeChatBtn")
      if (closeChatBtn) {
        closeChatBtn.onclick = () => {
          // Reset typing when closing chat
          if (isTyping) {
            isTyping = false
            sendTypingStatus(false)
          }
          document.getElementById("chatWindow").classList.add("hidden")
          selectedUser = null;
          document.getElementById("chatWithName").textContent = ""
        }
      }
      notification(currentUser, username, 0)
      const cachedMessages = chatCache.get(username)
      if (cachedMessages) {
        const sortedCached = [...cachedMessages].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        sortedCached.forEach(renderMessage)
      } else {
        try {
          chatPage = 0
          noMoreMessages = false
          const res = await fetch(`/messages?from=${currentUser}&to=${selectedUser}&offset=0`)
          if (!res.ok) throw new Error("Failed to load chat history")
          const messages = await res.json()
          const sortedMessages = messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
          chatCache.set(selectedUser, sortedMessages)
          sortedMessages.forEach(renderMessage)
        } catch (err) {
          console.error("Chat history error:", err)
        }
      }
    })

    list.appendChild(div)
  })
}

function updateNotificationBadge(data) {
  const userList = document.getElementById("userList")
  const users = userList.getElementsByClassName("user")
  if (!userList || data.unread_messages == 0) return;

  for (let div of users) {
    const nameSpan = div.querySelector("span:first-child")
    if (nameSpan && nameSpan.textContent === data.sender_nickname) {
      let badge = div.querySelector(".notification-badge")

      if (!badge) {
        badge = document.createElement("span")
        badge.classList.add("notification-badge")
        div.appendChild(badge)
      }
      badge.textContent = data.unread_messages
    }
  }
}

function notification(receiver, sender, unread) {
  const notifData = {
    receiver_nickname: receiver,
    sender_nickname: sender,
    ...(unread != null && { unread_messages: unread })
  };

  fetch("/notification", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(notifData)
  })
    .then(res => {
      if (!res.ok) {
        throw new Error("notif failed");
      }
      return res.json();
    })
    .then(data => {
      updateNotificationBadge(data)
    })
    .catch(err => {
      console.error(err);
    });
}