const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const http = require('http'); // Added for socket.io
const { Server } = require("socket.io"); // Added for socket.io
const { v4: uuidv4 } = require('uuid'); // For unique IDs
const multer = require('multer'); // Added for file uploads

const app = express();
const server = http.createServer(app); // Create HTTP server for socket.io
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity, configure as needed for production
        methods: ["GET", "POST"]
    }
}); // Initialize socket.io

const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your_jwt_secret'; // Use a strong, unique secret in a real application

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded (needed for multer sometimes)

// --- File Upload Setup ---
const uploadsDir = path.join(__dirname, 'uploads');
const imageUploadsDir = path.join(uploadsDir, 'images');
const videoUploadsDir = path.join(uploadsDir, 'videos');

// Ensure upload directories exist
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(imageUploadsDir)) fs.mkdirSync(imageUploadsDir);
if (!fs.existsSync(videoUploadsDir)) fs.mkdirSync(videoUploadsDir);

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(uploadsDir));

// Multer disk storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let destDir = uploadsDir; // Default
        if (file.mimetype.startsWith('image/')) {
            destDir = imageUploadsDir;
        } else if (file.mimetype.startsWith('video/')) {
            destDir = videoUploadsDir;
        }
        cb(null, destDir);
    },
    filename: function (req, file, cb) {
        // Sanitize filename and make it unique
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        const sanitizedOriginalname = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(extension, '');
        cb(null, sanitizedOriginalname + '-' + uniqueSuffix + extension);
    }
});

// Multer file filter
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
        cb(null, true);
    } else {
        cb(new Error('Unsupported file type! Only images and videos are allowed.'), false);
    }
};

const upload = multer({ 
    storage: storage, 
    limits: {
        fileSize: 1024 * 1024 * 50 // 50MB limit for files, adjust as needed
    },
    fileFilter: fileFilter 
});
// --- End File Upload Setup ---

// Paths to data files
const dataDir = path.join(__dirname, 'data');
const usersFilePath = path.join(dataDir, 'users.json');
const chatsFilePath = path.join(dataDir, 'chats.json'); // Stores chat metadata (participants, name)
const messagesFilePath = path.join(dataDir, 'messages.json'); // Stores actual messages

// Helper function to ensure data directory and files exist
const ensureDataFiles = () => {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(usersFilePath)) {
        fs.writeFileSync(usersFilePath, JSON.stringify([]));
    }
    if (!fs.existsSync(chatsFilePath)) {
        fs.writeFileSync(chatsFilePath, JSON.stringify([]));
    }
    if (!fs.existsSync(messagesFilePath)) {
        // If we had old messages from the previous chats.json, we can write them here
        // For now, starting fresh or assuming the old file was empty if it didn't exist.
        // const oldMessages = []; // Potentially populate from read_file result if needed
        fs.writeFileSync(messagesFilePath, JSON.stringify([]));
    }
};
ensureDataFiles();

// Helper functions to read/save data
const getUsers = () => JSON.parse(fs.readFileSync(usersFilePath));
const saveUsers = (users) => fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
const getChats = () => JSON.parse(fs.readFileSync(chatsFilePath));
const saveChats = (chats) => fs.writeFileSync(chatsFilePath, JSON.stringify(chats, null, 2));
const getMessages = () => JSON.parse(fs.readFileSync(messagesFilePath));
const saveMessages = (messages) => fs.writeFileSync(messagesFilePath, JSON.stringify(messages, null, 2));

// Registration route
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Username, email, and password are required' });
    }
    const users = getUsers();
    if (users.find(user => user.email === email)) {
        return res.status(400).json({ message: 'Email already exists' });
    }
    if (users.find(user => user.username === username)) {
        return res.status(400).json({ message: 'Username already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { id: uuidv4(), username, email, password: hashedPassword };
    users.push(newUser);
    saveUsers(users);
    res.status(201).json({ message: 'User registered successfully' });
});

// Login route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }
    const users = getUsers();
    const user = users.find(user => user.email === email);
    if (!user) {
        return res.status(400).json({ message: 'Invalid credentials (user not found)' });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(400).json({ message: 'Invalid credentials (password mismatch)' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user; // Add user payload to request
        next();
    });
};

// API: Create a new chat
app.post('/api/chats', authenticateToken, (req, res) => {
    const { name, userUsernames } = req.body; // userUsernames is an array of usernames to add
    const currentUser = req.user;

    if (!name || !userUsernames || !Array.isArray(userUsernames) || userUsernames.length === 0) {
        return res.status(400).json({ message: 'Chat name and at least one other user are required.' });
    }

    const allUsers = getUsers();
    const participantIds = [currentUser.id];
    const participantUsernames = [currentUser.username];

    for (const username of userUsernames) {
        const userToAdd = allUsers.find(u => u.username === username);
        if (!userToAdd) {
            return res.status(404).json({ message: 'User "' + username + '" not found.' });
        }
        if (!participantIds.includes(userToAdd.id)) {
            participantIds.push(userToAdd.id);
            participantUsernames.push(userToAdd.username);
        }
    }
    
    if (participantIds.length < 2) { // Creator plus at least one other
         return res.status(400).json({ message: 'A chat must have at least two distinct participants.' });
    }

    const chats = getChats();
    const newChat = {
        id: uuidv4(),
        name: name,
        participants: participantIds, // Store by ID
        participantUsernames: participantUsernames, // Store usernames for easier display
        createdBy: currentUser.id,
        createdAt: new Date().toISOString()
    };

    chats.push(newChat);
    saveChats(chats);
    res.status(201).json(newChat);
});

// API: Get chats for the logged-in user
app.get('/api/chats', authenticateToken, (req, res) => {
    const currentUser = req.user;
    const allChats = getChats();
    const userChats = allChats.filter(chat => chat.participants.includes(currentUser.id));
    res.json(userChats);
});

// --- New File Upload Endpoint ---
// The route parameter ':chatId' might not be strictly necessary if chatId is sent in form data
// but can be useful for context or if you want to associate upload directly to a chat via URL.
app.post('/api/upload/:chatId', authenticateToken, upload.single('mediaFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded or file type not supported.' });
    }

    // Construct the file URL
    const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
    const fileUrl = `/uploads/${fileType === 'image' ? 'images' : 'videos'}/${req.file.filename}`;

    // The frontend will typically send this as a message via Socket.IO after getting this response.
    res.status(201).json({
        message: 'File uploaded successfully',
        fileUrl: fileUrl, // URL to access the file
        filename: req.file.filename, // Stored filename
        originalFilename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        type: fileType // 'image' or 'video'
    });
}, (error, req, res, next) => {
    // Error handler for multer
    if (error instanceof multer.MulterError) {
        return res.status(400).json({ message: `Multer error: ${error.message}` });
    }
    if (error) {
        return res.status(400).json({ message: error.message }); // From fileFilter
    }
    next();
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    const userId = socket.handshake.query.userId; // Expect userId to be passed in query

    // Handle joining chat rooms
    socket.on('join_chat', (chatId) => {
        socket.join(chatId);
        console.log('User ' + (userId || socket.id) + ' joined chat ' + chatId);
        // Load messages for this chat
        const allMessages = getMessages();
        const chatMessages = allMessages.filter(msg => msg.chatId === chatId);
        socket.emit('load_messages', { chatId, messages: chatMessages });
    });

    socket.on('send_message', (messageData) => {
        // messageData can now be { text, senderId, chatId, type, url, originalFilename }
        const { text, senderId, chatId, type = 'text', url, originalFilename } = messageData;

        if (!senderId || !chatId) {
            console.error('Invalid message data: senderId or chatId missing', messageData);
            return;
        }
        // For text messages, text is required. For files, url is required.
        if (type === 'text' && !text) {
             console.error('Invalid text message data: text missing', messageData);
            return;
        }
        if ((type === 'image' || type === 'video') && !url) {
            console.error('Invalid file message data: url missing', messageData);
            return;
        }

        console.log(`Message from ${senderId} in chat ${chatId} (type: ${type}): ${type === 'text' ? text : url}`);
        
        const allMessages = getMessages();
        const newMessage = {
            id: uuidv4(),
            chatId: chatId,
            senderId: senderId,
            type: type, // 'text', 'image', 'video'
            text: type === 'text' ? text : null, // Store text only if it's a text message
            url: url, // URL for image/video
            originalFilename: originalFilename, // Original name of the uploaded file
            timestamp: new Date().toISOString()
        };
        allMessages.push(newMessage);
        saveMessages(allMessages);

        io.to(chatId).emit('receive_message', newMessage);
    });

    socket.on('leave_chat', (chatId) => {
        socket.leave(chatId);
        console.log('User ' + (userId || socket.id) + ' left chat ' + chatId);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Potentially handle removing user from all joined rooms if tracking that server-side
    });
});

server.listen(PORT, () => { // Use server.listen for socket.io
    console.log('Server is running on port ' + PORT + ', serving uploads from /uploads');
});