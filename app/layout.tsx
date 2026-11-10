import './globals.css';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'Shinzo Panel | Document Studio',description:'Private administrative and editor workspace for watermarked document demonstrations.'};
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
