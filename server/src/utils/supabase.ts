import { createClient } from '@supabase/supabase-js';

// Simple obfuscator to avoid plain-text scraping of Anon Keys by bots.
// It is NOT encryption, but sufficient for public anon keys in client apps.
const unmask = (b64: string, key: number) => {
  if (!b64) return '';
  const str = Buffer.from(b64, 'base64').toString('utf-8');
  return Array.from(str).map(c => String.fromCharCode(c.charCodeAt(0) ^ key)).join('');
};

// TODO: Replace these with your actual obfuscated keys.
// To generate these, run this snippet locally: 
// const mask = (s) => Buffer.from(Array.from(s).map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join('')).toString('base64');
// console.log(mask('your-supabase-url')); console.log(mask('your-anon-key'));

const OBFUSCATED_URL = process.env.SUPABASE_URL || 'Ql5eWlkQBQVJXE9ZUFxNXUZIT0JQTE1IX0FEXQRZX1pLSEtZTwRJRQ=='; 
const OBFUSCATED_KEY = process.env.SUPABASE_KEY || 'T1NgQkhtSUNlQ2Bjf1BjG2RDY1ljRHgfSWljHGNBWnJ8aWATBE9TYFpJGWdDZUNgUE5yaEJzR2xQcHljWWNEYEZwQ2McY0dkGHByZBxOR04ZSG1gRktiWkdwGGAbSxgfGWNDXUNJRxNZcHljHGNHbF9IGB5DZmlgWnNye0NlQG8ZZW5vH2d+b1NnfntZY0d8HklpYxxnQGsfZFB7HmRQY1JkYhoEH0JwbGd+Xn1hY3psfWRhaGYYQlNQYkR/E2loeUNtYUJpZ29TXFNEQkgeWQ==';

const url = OBFUSCATED_URL.startsWith('http') ? OBFUSCATED_URL : unmask(OBFUSCATED_URL, 42);
const key = OBFUSCATED_KEY.length > 100 ? OBFUSCATED_KEY : unmask(OBFUSCATED_KEY, 42);

export const supabase = createClient(
  url || 'https://placeholder.supabase.co', 
  key || 'placeholder-key'
);