import { setupCommentSubmission, toggleComments } from "./comments.js"

export async function loadPosts() {
  const response = await fetch("/posts")
  const posts = await response.json()

  const postsList = document.getElementById("postsList")
  postsList.innerHTML = ""

  posts.forEach((post) => {
    const div = document.createElement("div")
    div.classList.add("post")
    div.innerHTML = `
      <h3>${post.title}</h3>
      <p>${post.content}</p>
      <small>Category: ${post.category} | By: ${post.author} | At: ${new Date(post.created_at).toLocaleString()}</small>
      
      <div class="post-actions">
        <button class="toggle-comments-btn" data-post-id="${post.id}">
          Show Comments
        </button>
      </div>
      
      <div id="comments-section-${post.id}" class="comments-section hidden">
        <h4>Comments</h4>
        <div id="comments-${post.id}" class="comments-container">
          <p>Loading comments...</p>
        </div>
        
        <form id="comment-form-${post.id}" class="comment-form">
          <textarea class="comment-input" placeholder="Write a comment..." required></textarea>
          <button type="submit">Post Comment</button>
        </form>
      </div>
    `
    postsList.appendChild(div)

    const toggleBtn = div.querySelector(".toggle-comments-btn")
    toggleBtn.addEventListener("click", () => {
      const postId = toggleBtn.getAttribute("data-post-id")
      toggleComments(postId)
      if (toggleBtn.textContent.trim() === "Show Comments") {
        toggleBtn.textContent = "Hide Comments"
      } else {
        toggleBtn.textContent = "Show Comments"
      }
    })
    setupCommentSubmission(post.id)
  })
}
