import ky from 'ky';

export const httpClient = ky.extend({
  hooks: {
    beforeError: [
      async (error) => {
        console.log(await error.response.json());
        return error;
      },
    ],
  },
});
