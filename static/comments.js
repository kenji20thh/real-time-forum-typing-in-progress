import { showSection } from './app.js';

export async function loadComments(postId) {
  try {
    const response = await fetch(`comments?post_id=${postId}`)
    if (!response.ok) {
      throw new Error("Failed to load comments")
    }
    const comments = await response.json()
    displayComments(postId, comments)
  } catch (error) {
    console.error("Error loading comments:", error)
  }
}

function displayComments(postId, comments) {
  const commentsContainer = document.getElementById(`comments-${postId}`)
  if (!commentsContainer) return
  commentsContainer.innerHTML = ""
  if (comments.length === 0) {
    commentsContainer.innerHTML = '<p class="no-comments">No comments yet. Be the first to comment!</p>'
    return
  }
  comments.forEach((comment) => {
    const commentElement = document.createElement("div")
    commentElement.classList.add("comment")
    commentElement.innerHTML = `
        <div class="comment-header">
          <span class="comment-author">${comment.author}</span>
          <span class="comment-date">${new Date(comment.created_at).toLocaleString()}</span>
        </div>
        <div class="comment-content">${comment.content}</div>
      `
    commentsContainer.appendChild(commentElement)
  })
}

export function setupCommentSubmission(postId) {
  const form = document.getElementById(`comment-form-${postId}`)
  if (!form) return
  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    const commentContent = form.querySelector(".comment-input").value.trim()
    if (!commentContent) return
    try {
      const response = await fetch("/createComment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post_id: postId,
          content: commentContent,
        }),
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to submit comment")
      }

      form.querySelector(".comment-input").value = ""
      loadComments(postId)
    } catch (error) {
      showSection("loginSection")
    }
  })
}

export function toggleComments(postId) {
  const commentsSection = document.getElementById(`comments-section-${postId}`)
  if (commentsSection.classList.contains("hidden")) {
    commentsSection.classList.remove("hidden")
    loadComments(postId)
  } else {
    commentsSection.classList.add("hidden")
  }
}
