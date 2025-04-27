// app/layout.js (update to include Toaster)
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '../components/Toaster'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  metadataBase: new URL('https://Trainified.com'),
  title: 'Fine-Tune AI models with your data | Trainified.com',
  description: 'Transform your business documents into structured, fine-tuning ready AI datasets, automating weeks of manual work in minutes.',
  openGraph: {
    title: 'Fine-Tune AI models with your data | Trainified.com',
    description: 'Transform your business documents into structured, fine-tuning ready AI datasets, automating weeks of manual work in minutes.',
    images: [
      {
        url: '/bannerimage.png',
        width: 1200,
        height: 630,
        alt: 'Trainified - Fine-Tune AI models with your data',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fine-Tune AI models with your data | Trainified.com',
    description: 'Transform your business documents into structured, fine-tuning ready AI datasets, automating weeks of manual work in minutes.',
    images: ['/bannerimage.png'],
    creator: '@Trainified',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen flex flex-col">
          {/* <header className="bg-primary-700 text-white shadow-md">
            <div className="container mx-auto px-4 py-4">
              <h1 className="text-2xl font-bold">Synthetic Data Pipeline</h1>
              <p className="text-sm text-primary-200">Process documents to generate high-quality training data</p>
            </div>
          </header> */}
          <main className="flex-grow container mx-auto px-4 py-8">
            {children}
          </main>
          {/* <footer className="bg-gray-100 border-t border-gray-200">
            <div className="container mx-auto px-4 py-4 text-center text-gray-600 text-sm">
              &copy; {new Date().getFullYear()} Synthetic Data Pipeline
            </div>
          </footer> */}
        </div>
        <Toaster />
      </body>
    </html>
  )
}