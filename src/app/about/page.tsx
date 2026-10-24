import { getAlbums, getSiteConfig } from '@/lib/api';
import MiniChinaMap from '@/lib/map/mini-china-map';
import Nav from '@/lib/nav';
import Noise from '@/lib/fx/noise';
import { ExternalLink } from '@/lib/external-link';
import { SiteConfig } from '@/types';
import Link from 'next/link';

function Contact({ siteConfig }: { siteConfig: SiteConfig }) {
  return (
    <div id="contact" className="flex flex-wrap gap-14">
      <div>
        <h2 className="uppercase tracking-tight text-sm mb-2 font-light text-gray-500">
          社交媒体 / Socials
        </h2>
        <ul className="text-lg font-medium space-y-1">
          {siteConfig.socials.map(social => (
            <li key={social.label}>
              <ExternalLink href={social.url}>{social.label}</ExternalLink>
            </li>
          ))}
        </ul>
      </div>
      <div className="border border-dashed border-gray-300 rounded-lg p-4 -mt-4 bg-white/40">
        <h2 className="uppercase tracking-tight text-sm mb-2 font-light text-gray-500">
          快捷入口 / Links
        </h2>
        <ul className="text-lg font-medium space-y-1">
          {siteConfig.links.map(link => (
            <li key={link.label}>
              {link.url.startsWith('/') ? (
                <Link
                  href={link.url}
                  className="hover:text-red-700 transition-colors"
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
        <section className="z-20 relative max-w-xl">
          <h1 className="font-bold text-4xl tracking-tight">
            {siteConfig.photographerName}
          </h1>
          <p className="text-2xl text-gray-700 font-light mt-1">
            <span className="text-red-700">✦</span> {siteConfig.subtitle}
          </p>

          <p className="mt-16 mb-6 text-lg text-gray-700 leading-relaxed">
            {siteConfig.bioParagraph1}
          </p>

          <p className="mb-24 text-lg text-gray-600 leading-relaxed">
            {siteConfig.bioParagraph2}
          </p>

          <Contact siteConfig={siteConfig} />
        </section>

        <MiniChinaMap
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
            boxShadow: 'inset 0 0 50px 125px rgb(243 244 246 / 65%)'
          }}
        />
        <Noise />
      </div>
    </section>
  );
}

export default AboutPage;
