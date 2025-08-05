import { showSection } from './app.js';

export function logout(event) {
  event.preventDefault();
  fetch("/logout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  })
    .then(res => {
      if (!res.ok) throw new Error("logout failed");
      return res.text();
    })
    .then(() => {
      localStorage.setItem('logout', Date.now());
      window.location.reload()
    })
    .catch(err => console.error(err));
}
