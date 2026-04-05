import { Client, Databases, Account } from 'appwrite';

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '';

const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId);

export const databases = new Databases(client);
export const account = new Account(client);
export const appwriteClient = client;
