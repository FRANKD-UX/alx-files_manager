// controllers/UsersController.js
import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db.js';
import redisClient from '../utils/redis.js';
import Queue from 'bull';

const userQueue = new Queue('user queue');

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    try {
      const db = dbClient.client.db(dbClient.database);
      const users = db.collection('users');

      // Check if user already exists
      const existingUser = await users.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: 'Already exist' });
      }

      // Hash password
      const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');

      // Create new user
      const newUser = {
        email,
        password: hashedPassword,
      };

      const result = await users.insertOne(newUser);
      
      // Add job to user queue for welcome email
      userQueue.add({ userId: result.insertedId.toString() });

      res.status(201).json({
        id: result.insertedId.toString(),
        email,
      });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getMe(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const db = dbClient.client.db(dbClient.database);
      const users = db.collection('users');
      const user = await users.findOne({ _id: new ObjectId(userId) });

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      res.status(200).json({
        id: user._id.toString(),
        email: user.email,
      });
    } catch (error) {
      console.error('Error getting user:', error);
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
}

export default UsersController;
