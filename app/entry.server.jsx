import { RemixServer } from '@remix-run/react';
import isbot from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { createContentSecurityPolicy } from '@shopify/hydrogen';

/**
 * @param {Request} request
 * @param {number} responseStatusCode
 * @param {Headers} responseHeaders
 * @param {EntryContext} remixContext
 * @param {AppLoadContext} context
 */
export default async function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  remixContext,
  context,
) {
  // Create the default Content Security Policy with Shopify helper
  const { nonce, header: defaultCSPHeader, NonceProvider } = createContentSecurityPolicy({
    shop: {
      checkoutDomain: context.env.PUBLIC_CHECKOUT_DOMAIN,
      storeDomain: context.env.PUBLIC_STORE_DOMAIN,
    },
  });

  // Define specific policies
  const imgSrcDirective = "img-src 'self' https://cdn.shopify.com https://shopify.com https://letsenhance.io https://cdn.jsdelivr.net data:;";
  const styleSrcDirective = "style-src 'self' 'unsafe-inline' https://cdn.shopify.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com;";
  const scriptSrcDirective = `script-src 'self' 'nonce-${nonce}' https://cdn.shopify.com https://cdn.jsdelivr.net;`;
  const connectSrcDirective = `connect-src 'self' https://monorail-edge.shopifysvc.com;`;
  const connectFontDirective = `font-src 'self' https://cdnjs.cloudflare.com;`;

  // Combine directives without duplication
  const directives = new Map();

  // Add default CSP directives
  defaultCSPHeader.split(';').forEach((directive) => {
    const [key, value] = directive.trim().split(' ', 2);
    if (key) {
      directives.set(key, value);
    }
  });

  // Add specific directives
  directives.set('img-src', imgSrcDirective.split(' ').slice(1).join(' '));
  directives.set('style-src', styleSrcDirective.split(' ').slice(1).join(' '));
  directives.set('script-src', scriptSrcDirective.split(' ').slice(1).join(' '));
  directives.set('connect-src', connectSrcDirective.split(' ').slice(1).join(' '));
  directives.set('font-src', connectFontDirective.split(' ').slice(1).join(' '));

  // Construct the final CSP header
  const finalCSP = Array.from(directives.entries())
    .map(([key, value]) => `${key} ${value}`)
    .join('; ') + ';';

  // Render the server-side app
  const body = await renderToReadableStream(
    <NonceProvider>
      <RemixServer context={remixContext} url={request.url} />
    </NonceProvider>,
    {
      nonce,
      signal: request.signal,
      onError(error) {
        console.error(error);
        responseStatusCode = 500;
      },
    },
  );

  if (isbot(request.headers.get('user-agent'))) {
    await body.allReady;
  }

  // Set the final CSP header
  responseHeaders.set('Content-Type', 'text/html');
  responseHeaders.set('Content-Security-Policy', finalCSP);

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}

/** @typedef {import('@shopify/remix-oxygen').EntryContext} EntryContext */
/** @typedef {import('@shopify/remix-oxygen').AppLoadContext} AppLoadContext */
