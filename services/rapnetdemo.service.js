
// const axios = require('axios');

// async function main() {
//   const res = await axios.post('https://authztoken.api.rapaport.com/api/get', {
//      client_id: 'SYDX99EYB1krzIxYZrvrtD5xV9gz0Vdb',
//     client_secret: '0wA226_A1OP5Outyp6UQjsHFxPkHGg6hUd1qFXKJtt5hOn0REeO32xZSpzT7EXaQ',
//   });

//   console.log(res.data);
// }

// main().catch(console.error);

const axios = require('axios');
const TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ik16aERRMFExTURFeVJqSTNRa0k0TTBGRVJUZzFNekUzTWtOQ09UTXhNREZDTVVZM1JURkNNZyJ9.eyJodHRwOi8vcmFwYXBvcnQuY29tL3VzZXIiOnsiYWNjb3VudElkIjo2MjQxMiwiY29udGFjdElkIjo4OTk4LCJzZk1hc3RlckFjY291bnROdW1iZXIiOiJBMzQzMjgiLCJzZk1hc3RlckNvbnRhY3ROdW1iZXIiOiJDNDAxOSJ9LCJodHRwOi8vcmFwYXBvcnQuY29tL3Njb3BlIjpbInByaWNlTGlzdFdlZWtseSIsImluc3RhbnRJbnZlbnRvcnkiXSwiaHR0cDovL3JhcGFwb3J0LmNvbS9hcGlrZXkiOnsiaHR0cHM6Ly9pbnN0YW50aW52ZW50b3J5LnJhcG5ldGFwaXMuY29tIjoieHBMNWFzdlZMNDlVOHIycEZPVEtRYUo0NEhyNFYxaGZDWXZJWERYZSIsImh0dHBzOi8vcHJpY2VsaXN0LnJhcG5ldGFwaXMuY29tIjoiMlA4bklLZXRXVjJEQXBLVmRxc3VEN2hMamJOWXRETjczS3lpOHh0TyJ9LCJodHRwOi8vcmFwYXBvcnQuY29tL2F1ZGllbmNlIjpbImh0dHBzOi8vcHJpY2VsaXN0LnJhcG5ldGFwaXMuY29tIiwiaHR0cHM6Ly9hcGlnYXRld2F5LnJhcG5ldGFwaXMuY29tIiwiaHR0cHM6Ly9pbnN0YW50aW52ZW50b3J5LnJhcG5ldGFwaXMuY29tIl0sImh0dHA6Ly9yYXBhcG9ydC5jb20vbWV0YWRhdGEiOm51bGwsImh0dHA6Ly9yYXBhcG9ydC5jb20vcGVybWlzc2lvbnMiOnsicmFwbmV0YXBpcy1hcGlnYXRld2F5IjpbIm1lbWJlckRpcmVjdG9yeSIsInByaWNlTGlzdFdlZWtseSIsInByaWNlTGlzdE1vbnRobHkiLCJyYXBuZXRQcmljZUxpc3RXZWVrbHkiLCJiYXNpYyIsInJhcG5ldFByaWNlTGlzdE1vbnRobHkiLCJyYXBuZXRMaWdodCIsInNlYXJjaCIsImluc3RhbnRJbnZlbnRvcnlTZXR1cCIsIm1hbmFnZUxpc3RpbmdzRmlsZSIsImJ1eVJlcXVlc3RzQWRkIiwiZ2Vtc1VwbG9hZCIsIml0ZW1TaGFyZWQiLCJ0cmFkZUNlbnRlciIsIm15Q29udGFjdHMiLCJtZW1iZXJSYXRpbmciLCJnZW1zIiwiY2hhdCIsImluc3RhbnRJbnZlbnRvcnkiLCJsZWFkcyIsImFkbWluIiwiYnV5UmVxdWVzdHMiXX0sImlzcyI6Imh0dHBzOi8vcmFwYXBvcnQuYXV0aDAuY29tLyIsInN1YiI6IkU4RG8yOHpjTk1qQXdZYWZKUXB2eG4yUGhRUXoyM0ZsQGNsaWVudHMiLCJhdWQiOiJodHRwczovL2FwaWdhdGV3YXkucmFwbmV0YXBpcy5jb20iLCJpYXQiOjE3Nzg3ODYzMjQsImV4cCI6MTc3ODg3MjcyNCwic2NvcGUiOiJhcGlHYXRld2F5IiwiZ3R5IjoiY2xpZW50LWNyZWRlbnRpYWxzIiwiYXpwIjoiRThEbzI4emNOTWpBd1lhZkpRcHZ4bjJQaFFRejIzRmwifQ.P68MjXRzGMKyqGcSRRxT8YK0r8gDhlus8bRjAXDjiEq_11GlLpJbtRRFIDOwk4Nh2gnDIkBL7OA-RDd1yZEb5SvbbvhiZnn0mNbmj5Mng2NYgvCrGsAnwk-yUpWhIhkUgTkLKX-7ciXUT_6EQ48wKf2PYkzzLQpPhkoXz0YCwX0E0gba-JFAohLCtzwV5RjGOVGiAl6u22leL9Q4pOeW1cXCGtxgwh8dipdQt_YZJ0DbUpBl24BKI3qzvEBZRbPGLnU8NQ18aQPk7dUucCi8ZAbqy1pgsVmBwlAJqJ7E1y2S09UrdjI8pQtdFEFQDxYZYtVJSPRBloZbPLGqvceiBA'


async function getRapnetDiamonds() {
  const res = await axios.post(
    'https://technet.rapnetapis.com/instant-inventory/api/Diamonds',
    {
        // Host: technet.rapnetapis.com
      request: {
        header: {
          username: '62412',
        },
      body: {
        page_number: 1,
        page_size: 20,
        carat_from: 0.01,
        carat_to: 20
    }
        // body: {
        //   page_number: 1,
        //   page_size: 20,
        //   shapes: [],
        //   colors: [],
        //   clarities: [],
        //   cut: [],
        //   labs: [],
        //   carat_from: 0.1,
        //   carat_to: 10
        // }
      }
    },
    {
      headers: {
        Host: technet.rapnetapis.com,
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        
      },
    }
  );

  console.log(JSON.stringify(res.data, null, 2));
}

getRapnetDiamonds().catch((err) => {
  console.log('STATUS:', err.response?.status);
  console.log('DATA:', JSON.stringify(err.response?.data, null, 2));
});