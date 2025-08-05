import { handleRegister } from './regester.js';
import { startChatFeature } from './chat.js';
import { handleLogin } from './login.js';
import { loadPosts } from './posts.js';
import { logout } from './logout.js';


window.addEventListener('storage', function (event) {
  console.log('Storage event triggered:', event);
  if (event.key === 'logout') {
    window.location.reload()
  }
});

export function showSection(sectionId) {
  document.querySelectorAll('section').forEach(section => {
    section.classList.add('hidden');
  });
  document.getElementById(sectionId).classList.remove('hidden');
}

document.getElementById('showLogin').addEventListener('click', () => {
  showSection('loginSection');
});

document.getElementById('showRegister').addEventListener('click', () => {
  showSection('registerSection');
});

document.getElementById('logoutBtn').addEventListener('click', (e) => {
  logout(e);
  document.getElementById('usernameDisplay').textContent = logged(false);
});

document.getElementById('registerForm').addEventListener('submit', async function (e) {
  handleRegister(e);
});

document.getElementById('loginForm').addEventListener('submit', async function (e) {
  handleLogin(e);
});

document.getElementById('createPostForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const form = e.target;
  const postData = {
    title: form.title.value,
    content: form.content.value,
    category: form.category.value
  };

  const response = await fetch('/createPost', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(postData),
    credentials: 'include'
  });

  if (response.ok) {
    alert('Post created!');
    form.reset();
    loadPosts();
  } else {
    alert('Failed to create post');
  }
});

const checkLoggedIn = () => {
  fetch('/logged', {
    credentials: 'include'
  })
    .then(res => {
      if (!res.ok) throw new Error('Not logged in')
      return res.json()
    })
    .then(data => {
      logged(true, data.username)
      startChatFeature(data.username)
      loadPosts()
      showSection('postsSection') // only if logedin
    })
    .catch(() => {
      logged(false)
      showSection('loginSection') // if not loggedin show loggin
    })
}

document.addEventListener('DOMContentLoaded', function () {
  checkLoggedIn();
  loadPosts();
});



export function logged(bool, user) {
  if (bool) {
    document.getElementById('usernameDisplay').textContent = user
    document.getElementById('showLogin').classList.add('hidden');
    document.getElementById('showRegister').classList.add('hidden');
    document.getElementById('logoutBtn').classList.remove('hidden');
    document.getElementById('createPostForm').classList.remove('hidden');
  } else {
    document.getElementById('usernameDisplay').textContent = ""
    document.getElementById('showLogin').classList.remove('hidden');
    document.getElementById('showRegister').classList.remove('hidden');
    document.getElementById('logoutBtn').classList.add('hidden');
    document.getElementById('createPostForm').classList.add('hidden');
  }
}