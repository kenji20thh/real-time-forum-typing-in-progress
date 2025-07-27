import { showSection,logged } from './app.js';
import { startChatFeature } from './chat.js';

export function handleLogin(event) {
  event.preventDefault();
  const formData = {
    identifier: document.getElementById("identifier").value,
    password: document.getElementById("loginPassword").value
  };

  fetch("/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(formData)
  })
    .then(res => {
      if (!res.ok) {
        throw new Error("Registration failed");
      }
      return res.json();
    })
    .then(data => {
      startChatFeature(data.username);
      showSection('postsSection');
      logged(true,data.username);
    })
    .catch(err => {
      alert("Invalid login")
      logged(false)
      console.error(err);
    });
}
