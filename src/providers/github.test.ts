import { testProvider } from '../test/tester';
import { GithubProvider } from './github';

testProvider(GithubProvider, {
  token: process.env.GH_TOKEN,
  url: process.env.GH_URL,
});
