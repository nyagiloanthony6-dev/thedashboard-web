import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Geist:wght@500;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
        <meta name="theme-color" content="#F6F7FB" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
