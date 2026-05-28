const express = require("express");
const mysql = require('mysql2');
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const methodOverride = require("method-override");

// 1. .env Environment Variables
require('dotenv').config();

const app = express();

// 2. Database Connection Pool (Aiven Database Cloud Connection)
// 2. Database Connection Pool (Updated with SSL configuration)
const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: 22968, // Aiven ka port daalna zaroori hai agar .env me host ke sath nahi likha hai toh
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false // Yeh line cloud database se local computer ko bina error ke connect karne me madad karegi
    }
    
});

// 3. Port Configuration
const port = process.env.PORT || 8080; 

// Middleware Setup
app.use(express.urlencoded({ extended: true })); 
app.use(express.json()); 
app.use(express.static(path.join(__dirname, "public")));
app.use(methodOverride("_method"));

// EJS Layout Setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


// Utility function: Ab yeh 'users' table se password check karega
const checkPassword = (id, userpassword) => {
    return new Promise((resolve, reject) => {
        // Ab posts ki checking posts table se aur login users table se hogi
        const q = "SELECT password FROM users WHERE id = ?";
        connection.query(q, [id], (err, result) => {
            if (err) return reject(err);
            if (result.length > 0) {
                resolve(userpassword === result[0].password);
            } else {
                resolve(false); // User ID nahi mili
            }
        });
    });
};


// --- Routes ---

app.get("/", (req, res) => {
    res.redirect("/post");
});

// GET: All Posts (Index Page) - Dono tables ko JOIN kiya taaki username mil sake
app.get("/post", (req, res) => {
    const q = `
        SELECT posts.id, posts.post, posts.created_at, users.username 
        FROM posts 
        JOIN users ON posts.user_id = users.id 
        ORDER BY posts.created_at DESC
    `; 
    connection.query(q, (err, result) => {
        if(err) {
            console.error("Database query error:", err);
            return res.render("index.ejs", { result: [], error: "Failed to fetch posts." });
        }
        res.render("index.ejs", { result });
    });
});

// GET: New Post Form
app.get("/post/new", (req, res) => {
    res.render("newpost.ejs");
});

// POST: New Post Creation (Yahan duplicate posts handle hote hain seamlessly)
app.post("/post/new", (req, res) => {
    const { username, email, password, post } = req.body;

    // Pehle check karenge ki yeh email ya username pehle se registered hai ya nahi
    const checkUserQuery = "SELECT id FROM users WHERE email = ? OR username = ?";
    connection.query(checkUserQuery, [email, username], (err, results) => {
        if (err) {
            console.error("User check error:", err);
            return res.render("newpost.ejs", { error: "Database error during user validation." });
        }

        let userId;

        if (results.length > 0) {
            // Agar user pehle se exist karta hai, toh usi ki existing id use karenge
            userId = results[0].id;
            
            // Direct post table mein entry daal denge (koi duplicate unique error nahi aayega!)
            const insertPostQuery = "INSERT INTO posts (id, user_id, post) VALUES (?, ?, ?)";
            connection.query(insertPostQuery, [uuidv4(), userId, post], (postErr) => {
                if (postErr) {
                    console.error("Post insert error:", postErr);
                    return res.render("newpost.ejs", { error: "Failed to save your post." });
                }
                res.redirect("/post");
            });
        } else {
            // Agar naya banda hai, toh pehle uski profile 'users' table me banegi
            userId = uuidv4();
            const insertUserQuery = "INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)";
            
            connection.query(insertUserQuery, [userId, username, email, password], (userErr) => {
                if (userErr) {
                    console.error("User insert error:", userErr);
                    return res.render("newpost.ejs", { error: "Failed to create user account." });
                }

                // Profile banne ke baad uska 'post' posts table me save hoga
                const insertPostQuery = "INSERT INTO posts (id, user_id, post) VALUES (?, ?, ?)";
                connection.query(insertPostQuery, [uuidv4(), userId, post], (postErr) => {
                    if (postErr) {
                        console.error("Post insert error:", postErr);
                        return res.render("newpost.ejs", { error: "Account created but failed to save post." });
                    }
                    res.redirect("/post");
                });
            });
        }
    });
});

// GET: Individual Post (Show Details Page)
app.get("/post/:id", (req, res) => {
    let { id } = req.params;
    
    // Post ke sath user ki information details page par lane ke liye JOIN kiya
    const q = `
        SELECT posts.id, posts.post, users.username, users.email 
        FROM posts 
        JOIN users ON posts.user_id = users.id 
        WHERE posts.id = ?
    `;
    connection.query(q, [id], (err, result) => {
        if(err) {
            console.error("Show query error:", err);
            return res.status(500).send("Error fetching post details.");
        }
        if (result.length === 0) {
            return res.status(404).send("Post not found.");
        }
        res.render("show.ejs", { result });
    });
});

// GET: Check Password (Edit Authorization Gate)
app.get("/post/:id/edit", (req, res) => {
    let { id } = req.params;
    let what = "edit";
    res.render("checkpassword.ejs", { id, what });
});

// POST: Check Password & Render Edit Form
app.post("/post/:id/edit", async (req, res) => {
    const userpassword = req.body.password;
    let { id } = req.params;
    
    try {
        // Pehle pata lagayenge ki is post ko likhne wale user ki ID kya hai
        const findUserQ = "SELECT user_id FROM posts WHERE id = ?";
        connection.query(findUserQ, [id], async (err, postResult) => {
            if (err || postResult.length === 0) {
                return res.status(404).send("Post owner not found.");
            }
            
            const userId = postResult[0].user_id;
            let right = await checkPassword(userId, userpassword);
            
            if (right) {
                // Agar password sahi hai, toh details 'posts' aur 'users' se fetch karke edit screen par bhejenge
                const q = `
                    SELECT posts.id, posts.post, users.username, users.email, users.password 
                    FROM posts 
                    JOIN users ON posts.user_id = users.id 
                    WHERE posts.id = ?
                `;
                connection.query(q, [id], (editErr, result) => {
                    if(editErr) {
                        console.error("Edit form query error:", editErr);
                        return res.status(500).send("Error fetching data for edit.");
                    }
                    const data = result[0];
                    res.render("edit.ejs", {
                        id: data.id,
                        username: data.username,
                        email: data.email,
                        post: data.post,
                        password: data.password
                    });
                });
            } else {
                res.render("checkpassword.ejs", { id, what: "edit", error: "Wrong password" });
            }
        });
    } catch (error) {
        console.error("Async Password Check Exception:", error);
        res.status(500).send("Internal Server Error");
    }
});

// PATCH: Update Post Text and Profile
app.patch("/post/:id/edit", (req, res) => {
    const { id } = req.params;
    let { username, email, password, post } = req.body;

    // Pehle is post ke owner ki 'user_id' pata karenge
    const getOwnerQ = "SELECT user_id FROM posts WHERE id = ?";
    connection.query(getOwnerQ, [id], (err, postResult) => {
        if (err || postResult.length === 0) return res.status(404).send("Owner verification failed.");
        const userId = postResult[0].user_id;

        // 1. Check if username is used by ANOTHER user account
        const checkUsername = "SELECT * FROM users WHERE username = ? AND id != ?";
        connection.query(checkUsername, [username, userId], (uErr, results) => {
            if (uErr) return res.render("edit.ejs", { id, username, email, password, post, error: "Database error (Username check)" });
            if (results.length > 0) return res.render("edit.ejs", { id, username, email, password, post, error: "Username already in use" });

            // 2. Check if email is used by ANOTHER user account
            const checkEmail = "SELECT * FROM users WHERE email = ? AND id != ?";
            connection.query(checkEmail, [email, userId], (eErr, resultsEmail) => {
                if (eErr) return res.render("edit.ejs", { id, username, email, password, post, error: "Database error (Email check)" });
                if (resultsEmail.length > 0) return res.render("edit.ejs", { id, username, email, password, post, error: "Email already in use" });

                // 3. Pehle user ki account details update karenge
                const updateUserQuery = "UPDATE users SET username = ?, email = ?, password = ? WHERE id = ?";
                connection.query(updateUserQuery, [username, email, password, userId], (updateUErr) => {
                    if (updateUErr) return res.render("edit.ejs", { id, username, email, password, post, error: "Failed to update profile info" });
                    
                    // 4. Fir us specific post ka text content update karenge
                    const updatePostQuery = "UPDATE posts SET post = ? WHERE id = ?";
                    connection.query(updatePostQuery, [post, id], (updatePErr) => {
                        if (updatePErr) return res.render("edit.ejs", { id, username, email, password, post, error: "Failed to update post description" });
                        return res.redirect("/post");
                    });
                });
            });
        });
    });
});

// GET: Check Password (Delete Authorization Gate)
app.get("/post/:id/delete", (req, res) => {
    let { id } = req.params;
    let what = "delete";
    res.render("checkpassword.ejs", { id, what }); 
});

// DELETE: Specific Post Deletion
app.delete("/post/:id/delete", async (req, res) => {
    let userpassword = req.body.password;
    let { id } = req.params;
    
    try {
        // Pata karo yeh post kis user ka hai
        const getOwnerQ = "SELECT user_id FROM posts WHERE id = ?";
        connection.query(getOwnerQ, [id], async (err, postResult) => {
            if (err || postResult.length === 0) return res.status(404).send("Post not found.");
            const userId = postResult[0].user_id;

            const right = await checkPassword(userId, userpassword);
            
            if (right) {
                // Agar password correct hai, toh 'posts' table se post uda do
                const q = `DELETE FROM posts WHERE id = ?`;
                connection.query(q, [id], (deleteErr, result) => {
                    if(deleteErr) {
                        console.error("Delete query error:", deleteErr);
                        return res.render("checkpassword.ejs", { id, what: "delete", error: "Failed to delete post." });
                    }
                    res.redirect("/post");
                });
            } else {
                res.render("checkpassword.ejs", { id, what: "delete", error: "Wrong password" });
            }
        });
    } catch (error) {
        console.error("Delete Exception Handling:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Start Live Server
app.listen(port, () => {
    console.log(`Server is ready to run on port ${port}`);
});