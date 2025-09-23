// src/pages/_app.tsx
import type { AppProps } from 'next/app';
import ContextProvider from '../context/ContextProvider'; // Import the provider
import '../styles/globals.css';

// Note: We need to get the initial cookies for server-side rendering
function App({ Component, pageProps }: AppProps & { pageProps: { cookies: string | null } }) {
  return (
    <ContextProvider cookies={pageProps.cookies}>
      <Component {...pageProps} />
    </ContextProvider>
  );
}

// This function runs on the server to get cookies before the page renders
App.getInitialProps = async ({ ctx }: any) => {
  return {
    pageProps: {
      cookies: ctx.req.headers.cookie ?? null,
    },
  };
};

export default App;