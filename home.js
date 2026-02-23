const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* 🔥 YOUR FIREBASE CONFIG */
const app = initializeApp({
  apiKey: "AIzaSyBTBaxhkkzjmdJhe3_D4Q_vb05Y_bzzgbs",
  authDomain: "the-construction-site.firebaseapp.com",
  projectId: "the-construction-site",
  storageBucket: "the-construction-site.firebasestorage.app",
  messagingSenderId: "876100787591",
  appId: "1:876100787591:web:0ab1d8b97a6a2b552c8722"
});


const auth = getAuth(app);
const db = getFirestore(app);

const authSection = document.getElementById("auth-section");
const ideasSection = document.getElementById("ideas-section");
const ideasGrid = document.getElementById("ideas-grid");

onAuthStateChanged(auth, async user => {
  if (!user) {
    authSection.style.display = "block";
    ideasSection.style.display = "none";
    return;
  }

  authSection.style.display = "none";
  ideasSection.style.display = "block";

  loadIdeas(user.uid);
});

document.getElementById("login-btn").onclick = async () => {
  try {
    await signInWithEmailAndPassword(
      auth,
      emailInput.value,
      passwordInput.value
    );
  } catch (err) {
    alert(err.message);
    console.error(err);
  }
};

document.getElementById("signup-btn").onclick = async () => {
  try {
    await createUserWithEmailAndPassword(
      auth,
      emailInput.value,
      passwordInput.value
    );
  } catch (err) {
    alert(err.message);
    console.error(err);
  }
};

async function loadIdeas(uid) {
  const q = query(
    collection(db, "ideas"),
    where("owner", "==", uid)
  );

  const snap = await getDocs(q);

  snap.forEach(docSnap => {
  const card = document.createElement("div");
  card.className = "idea-card";
  card.dataset.id = docSnap.id;

  const title = document.createElement("div");
  title.className = "idea-title";
  title.textContent = docSnap.data().name;

  const menuBtn = document.createElement("button");
  menuBtn.className = "idea-menu-btn";
  menuBtn.textContent = "⋮";

  const menu = document.createElement("div");
  menu.className = "idea-menu hidden";
  menu.innerHTML = `
    <button class="rename-idea">Rename</button>
    <button class="delete-idea danger">Delete</button>
  `;

  card.appendChild(title);
  card.appendChild(menuBtn);
  card.appendChild(menu);

  card.addEventListener("click", (e) => {
    if (e.target.closest(".idea-menu-btn") || e.target.closest(".idea-menu")) return;
    window.location.href = `Sandbox/sandbox.html?ideaId=${docSnap.id}`;
  });

  ideasGrid.appendChild(card);
});
}

document.getElementById("create-idea").onclick = async () => {
  const name = prompt("Name your idea:");
  if (!name) return;

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Not signed in");

    // 🔑 Create ID FIRST
    const ideaRef = doc(collection(db, "ideas"));

    // 🔒 Explicitly create the idea document
    await setDoc(ideaRef, {
      name,
      owner: user.uid,
      currentStory: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    console.log("Idea created:", ideaRef.id);

    // 🚀 Navigate AFTER doc exists
    window.location.href =
      `Sandbox/sandbox.html?ideaId=${ideaRef.id}`;

  } catch (err) {
    alert("Failed to create idea: " + err.message);
    console.error(err);
  }
};
document.addEventListener("click", (e) => {
  // Close all menus if clicking outside
  document.querySelectorAll(".idea-menu").forEach(menu => {
    if (!menu.contains(e.target) && !menu.previousElementSibling.contains(e.target)) {
      menu.classList.add("hidden");
    }
  });

  // Open menu
  if (e.target.classList.contains("idea-menu-btn")) {
    const menu = e.target.nextElementSibling;
    menu.classList.toggle("hidden");
  }
});

document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("rename-idea")) return;

  const card = e.target.closest(".idea-card");
  const ideaId = card.dataset.id;

  const newName = prompt("Enter new idea name:");
  if (!newName) return;

  await updateDoc(doc(db, "ideas", ideaId), {
    name: newName
  });

  card.querySelector(".idea-title").innerText = newName;
});
document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("delete-idea")) return;

  const card = e.target.closest(".idea-card");
  const ideaId = card.dataset.id;

  const confirmed = confirm("Delete this idea? This cannot be undone.");
  if (!confirmed) return;

  await deleteDoc(doc(db, "ideas", ideaId));
  card.remove();
});
