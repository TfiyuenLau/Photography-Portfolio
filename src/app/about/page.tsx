import { getAlbums, getSiteConfig } from '@/lib/api';
import MiniGlobe from '@/lib/globes/mini-globe';
import Nav from '@/lib/nav';
import Noise from '@/lib/fx/noise';
import { ExternalLink } from '@/lib/external-link';
import { SiteConfig } from '@/types';
import Link from 'next/link';

function Contact({ siteConfig }: { siteConfig: SiteConfig }) {
  return (
    <div id="contact" className="flex gap-14">
      <div>
        <h2 className="uppercase tracking-tight text-sm mb-1 font-light text-gray-500">
          Socials
        </h2>
        <ul className="text-lg font-medium">
          {siteConfig.socials.map(social => (
            <li key={social.label}>
              <ExternalLink href={social.url}>{social.label}</ExternalLink>
            </li>
          ))}
        </ul>
      </div>
      <div className="border border-dashed border-gray-300 rounded-lg p-4 -mt-4">
        <h2 className="uppercase tracking-tight text-sm mb-1 font-light text-gray-500">
          Links
        </h2>
        <ul className="text-lg font-medium">
          {siteConfig.links
            .filter(
              link =>
                process.env.NEXT_PUBLIC_STATIC_EXPORT !== 'true' ||
                !link.url.startsWith('/admin')
            )
            .map(link => (
              <li key={link.label}>
                {link.url.startsWith('/') ? (
                  <Link
                    href={link.url}
                    className="hover:text-gray-500 transition-colors"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <ExternalLink href={link.url}>{link.label}</ExternalLink>
                )}
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

async function AboutPage() {
  const [albums, siteConfig] = await Promise.all([
    getAlbums(),
    getSiteConfig()
  ]);

  return (
    <section
      className={`flex flex-col sm:flex-row
        pt-10 sm:pt-5 sm:pb-5
        h-lvh max-sm:h-full max-sm:overflow-y-auto`}
    >
      <div
        className={`
           mx-auto sm:mx-0 sm:pt-24 sm:pl-20 sm:pr-30 space-y-1
           w-[320px]`}
      >
        <Nav albums={albums} />
      </div>

      <div
        className={`rounded-tl-xl rounded-bl-xl bg-gray-100
          px-9 py-8 pt-20
          w-full relative overflow-hidden`}
      >
        <section className="z-20 relative max-w-96">
          <h1 className="font-bold text-4xl tracking-tight">
            {siteConfig.photographerName}
          </h1>
          <p className="text-2xl text-gray-700 font-light">
            <span className="text-gray-300">✦</span> {siteConfig.subtitle}
          </p>

          <p className="mt-20 mb-6 text-lg">{siteConfig.bioParagraph1}</p>

          <p className="mb-32 text-lg">{siteConfig.bioParagraph2}</p>

          <Contact siteConfig={siteConfig} />
        </section>

        <MiniGlobe
          albums={albums}
          className={`-bottom-56 -right-40 max-sm:-bottom-28 max-sm:-right-32
            max-w-[920px] max-sm:w-[680px]
            fade-in`}
        />
        <div
          aria-hidden={true}
          className={`
            absolute -bottom-56 -right-40 pointer-events-none
            rounded-full border-[90px] border-gray-100
            max-xl:hidden max-w-[920px]`}
          style={{
            width: 900,
            height: 900,
            boxShadow: 'inset 0 0 50px 125px rgb(250 250 255 / 50%)'
          }}
        />
        <Noise />
      </div>
    </section>
  );
}

export default AboutPage;
