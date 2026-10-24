import Script from 'next/script';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src={`${basePath}/pig.min.js`} strategy="beforeInteractive" />

      {children}
    </>
  );
}
