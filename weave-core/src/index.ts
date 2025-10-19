import express from 'express';
import { z } from 'zod';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Basic route with Zod validation
const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().min(0)
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Weave.Core TypeScript Server is running!',
    timestamp: new Date().toISOString()
  });
});

app.post('/user', (req, res) => {
  try {
    const userData = UserSchema.parse(req.body);
    res.json({ 
      success: true, 
      user: userData 
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      error: 'Invalid user data',
      details: error
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to see the server`);
});

export default app;