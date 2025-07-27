import { showSection } from './app.js';

export function handleRegister(event) {
  event.preventDefault();

  const Age = parseInt(document.getElementById("age").value);

  if (Age < 1) {
    alert("you age is not accepted")
    return
  }

  const formData = {
    nickname: document.getElementById("nickname").value,
    first_name: document.getElementById("firstName").value,
    last_name: document.getElementById("lastName").value,
    email: document.getElementById("email").value,
    password: document.getElementById("password").value,
    age: Age,
    gender: document.getElementById("gender").value
  };

  fetch("/register", {
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
      return res.text();
    })
    .then(data => {
      showSection('loginSection');
    })
    .catch(err => {
      console.error(err);
    });
}
