const express =require("express"); //npm i express
let ejs = require('ejs');
const app = express();
const {v4 : uuidv4} = require("uuid");
const methodOverride = require("method-override"); // npm method-override
const mysql = require('mysql2');//for mysql 


const path = require("path");
app.use(express.urlencoded({ extended: true }));  // for form data
app.use(express.json());  // for JSON (optional, useful later)
app.use(express.static(path.join(__dirname,"public"))); 
app.use(methodOverride("_method"));




//for set ejs file 
app.set("view engine","ejs");
app.set("views", path.join(__dirname,"/views"));

let posts = [
  {
    id: uuidv4(),
    username: "Rahul_Sharma_Official",
    content: "The only limit to our realization of tomorrow will be our doubts of today. Embrace every challenge as an opportunity for growth. ✨"
  },
  {
    id: uuidv4(),
    username: "Priya_Singh_Writes",
    content: "Success is not final, failure is not fatal: it is the courage to continue that counts. Keep pushing your boundaries! 💪"
  },
  {
    id: uuidv4(),
    username: "Anil_Motivation",
    content: "Don't watch the clock; do what it does. Keep going. Consistency is the key to unlocking your full potential. 🚀"
  },
  {
    id: uuidv4(),
    username: "Meera_Inspires",
    content: "Your life does not get better by chance, it gets better by change. Start small, but start now. You have the power within you. ☀️"
  },
  {
    id: uuidv4(),
    username: "Vivek_Success_Stories",
    content: "Believe you can and you're halfway there. Your mindset is the most powerful tool you have. Cultivate positivity and watch your world transform. 🌱"
  }
];


//for connect database to the website SQL
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  database: 'quora',
  password:" ",
});

app.get("/",(req,res)=>{
  res.redirect("/post");
});
app.get("/post",(req,res)=>{
   const q = `SELECT * FROM user`;
   try{
      connection.query(q,(err,result)=>{
         if(err) throw err;
         
         res.render("index.ejs",{result});
      });
   }catch(err){
      console.log(err);
   }

   
});

app.get("/post/new",(req,res)=>{
   
   res.render("newpost.ejs");
});

app.post("/post/new",(req,res) =>{
  
   const { username, email, password ,post} = req.body;

  // Check if username already exists
//   const checkUsername = "SELECT * FROM user WHERE username = ?";
//   connection.query(checkUsername, [username], (err, results) => {
//     if (err) return res.render("newpost.ejs", { error: "Database error" });
//     if (results.length > 0) return res.render("newpost.ejs", { error: "Username already in use" });

    // Check if email already exists
   //  const checkEmail = "SELECT * FROM user WHERE email = ?";
   //  connection.query(checkEmail, [email], (err, results) => {
   //    if (err) return res.render("newpost.ejs", { error: "Database error" });
   //    if (results.length > 0) return res.render("newpost.ejs", { error: "Email already in use" });

      // Insert new user
      const query = "INSERT INTO user (id, username, email, password,post) VALUES (?, ?, ?, ?,?)";
      const values = [uuidv4(), username, email, password,post];
      connection.query(query, values, (err, result) => {
        if (err) return res.render("newpost.ejs", { error: "Failed to insert user" });
        res.redirect("/post"); // Redirect to list of users after successful insertion
      });
//     });
//   }); 
});
app.get("/post/:id",(req,res)=>{
   let {id} = req.params;
   
   const q =`SELECT * FROM user WHERE id=?`;
   try{
      connection.query(q,id,(err,result)=>{
         if(err) throw err;
         res.render("show.ejs",{result});

      });
   }catch(err){
      console.log(err);
   }
   // console.log(postid);
   
});

app.get("/post/:id/edit",(req,res)=>{
  let {id} = req.params;
  let what ="edit";
  res.render("checkpassword.ejs",{id,what});
});


const checkPassword = (id, userpassword) => {
  return new Promise((resolve, reject) => {
    const q = "SELECT password FROM user WHERE id = ?";
    connection.query(q, [id], (err, result) => {
      console.log(result[0].password);
      if (err) return reject(err);
      if (result.length > 0) {
        resolve(userpassword === result[0].password);
      } else {
        resolve(false);
      }
    });
  });
};

app.post("/post/:id/edit",async(req,res)=>{
   const userpassword = req.body.password;
   let {id} = req.params;
   let right = await checkPassword(id,userpassword);
   if(right){
      const q =`SELECT * FROM user where id=? `;
      try{
         connection.query(q,id,(err,result)=>{
            if(err) throw err;
            let id = result[0].id;
            let username = result[0].username;
            let email = result[0].email;
            let password = result[0].password;
            let post = result[0].post;
            res.render("edit.ejs",{id,username,email,post,password});
         });

      }catch(err){
         console.log(err);
      }
   }else{
      res.render("checkpassword.ejs", { id, what: "edit",error: "Wrong password" });
   }
  

});
app.patch("/post/:id/edit",(req,res) =>{
   const { id } = req.params;
  let { username, email, password,post } = req.body;

  //  Check if username is used by another user
  const checkUsername = "SELECT * FROM user WHERE username = ? AND id != ?";
  connection.query(checkUsername, [username, id], (err, results) => {
    if (err) return res.render("edit.ejs", { id, username, email, password, error: "Database error" });
    if (results.length > 0) return res.render("edit.ejs", { id, username, email, password, error: "Username already in use" });

    // Check if email is used by another user
    const checkEmail = "SELECT * FROM user WHERE email = ? AND id != ?";
    connection.query(checkEmail, [email, id], (err, results) => {
      if (err) return res.render("edit.ejs", { id, username, email, password, error: "Database error" });
      if (results.length > 0) return res.render("edit.ejs", { id, username, email, password, error: "Email already in use" });

      // Update user
      const updateQuery = "UPDATE user SET username = ?, post=?,email = ?, password = ? WHERE id = ?";
      const values = [username,post, email, password, id];
      connection.query(updateQuery, values, (err, result) => {
        if (err) return res.render("edit.ejs", { id, username, email, password, error: "Failed to update user" });
        return res.redirect("/post");
      });
    });
  });
});


app.get("/post/:id/delete",(req,res)=>{
   let {id} = req.params;
   let what ="delete";
   res.render("checkpassword.ejs",{id,what}); 
});

app.delete("/post/:id/delete",async(req,res)=>{
   let userpassword = req.body.password;
  console.log(userpassword);
  let {id} = req.params;
  
  console.log(id);
  const right = await checkPassword(id,userpassword);
  console.log(right);
  if(right){
    const q =`DELETE FROM user WHERE id= ?`;

    try{
      connection.query(q,id,(err,result)=>{
      
      res.redirect("/post");
    });
    }catch(err){
      console.log(err);
    }
   
  }else{
    res.render("checkpassword.ejs", { id, what: "delete",error: "Wrong password" });

  }
   

});




// connection.query(
//   'SELECT * FROM user',
//   function (err, results, fields) {
//     console.log(results); // results contains rows returned by server
//     console.log(fields); // fields contains extra meta data about results, if available
//   }
// );

const port =8080;
app.listen(port,()=>{
   console.log("hello server is rady of run");
});

