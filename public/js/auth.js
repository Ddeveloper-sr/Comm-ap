import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  updateProfile,
  doc,
  setDoc
} from "./firebase-config.js";

const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const errorText = document.getElementById("auth-error");

tabLogin.addEventListener("click", () => {
  tabLogin.classList.add("active");
  tabSignup.classList.remove("active");
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
  errorText.textContent = "";
});

tabSignup.addEventListener("click", () => {
  tabSignup.classList.add("active");
  tabLogin.classList.remove("active");
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  errorText.textContent = "";
});

// Redirect to app if already logged in
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "app.html";
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorText.textContent = "";
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "app.html";
  } catch (err) {
    errorText.textContent = friendlyError(err.code);
  }
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorText.textContent = "";
  const username = document.getElementById("signup-username").value.trim();
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;

  if (username.length < 2) {
    errorText.textContent = "Username must be at least 2 characters.";
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: username });

    // Save user profile to Firestore
    await setDoc(doc(db, "users", cred.user.uid), {
      username,
      email,
      createdAt: Date.now(),
      status: "online"
    });

    window.location.href = "app.html";
  } catch (err) {
    errorText.textContent = friendlyError(err.code);
  }
});

function friendlyError(code) {
  const map = {
    "auth/email-already-in-use": "That email is already registered.",
    "auth/invalid-email": "Invalid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Incorrect email or password."
  };
  return map[code] || "Something went wrong. Try again.";
}
