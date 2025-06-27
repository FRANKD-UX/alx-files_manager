// worker.js
import Queue from 'bull';
import imageThumbnail from 'image-thumbnail';
import fs from 'fs';
import { ObjectId } from 'mongodb';
import dbClient from './utils/db.js';

const fileQueue = new Queue('file queue');
const userQueue = new Queue('user queue');

// Process file queue for image thumbnails
fileQueue.process(async (job) => {
  const { userId, fileId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }

  if (!userId) {
    throw new Error('Missing userId');
  }

  try {
    const db = dbClient.client.db(dbClient.database);
    const files = db.collection('files');
    
    const file = await files.findOne({
      _id: new ObjectId(fileId),
      userId: new ObjectId(userId),
    });

    if (!file) {
      throw new Error('File not found');
    }

    if (file.type !== 'image') {
      throw new Error('File is not an image');
    }

    const { localPath } = file;
    
    if (!fs.existsSync(localPath)) {
      throw new Error('File not found on disk');
    }

    // Generate thumbnails for different sizes
    const sizes = [500, 250, 100];
    
    for (const size of sizes) {
      try {
        const thumbnail = await imageThumbnail(localPath, { width: size });
        const thumbnailPath = `${localPath}_${size}`;
        fs.writeFileSync(thumbnailPath, thumbnail);
        console.log(`Generated thumbnail: ${thumbnailPath}`);
      } catch (error) {
        console.error(`Error generating ${size}px thumbnail:`, error);
      }
    }
  } catch (error) {
    console.error('Error processing file job:', error);
    throw error;
  }
});

// Process user queue for welcome emails
userQueue.process(async (job) => {
  const { userId } = job.data;

  if (!userId) {
    throw new Error('Missing userId');
  }

  try {
    const db = dbClient.client.db(dbClient.database);
    const users = db.collection('users');
    
    const user = await users.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      throw new Error('User not found');
    }

    console.log(`Welcome ${user.email}!`);
  } catch (error) {
    console.error('Error processing user job:', error);
    throw error;
  }
});

console.log('Worker started...');
console.log('Processing file queue and user queue...');
