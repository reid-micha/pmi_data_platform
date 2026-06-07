import React from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

interface LayoutProps {
    children: React.ReactNode;
}

function Layout({ children }: LayoutProps): React.ReactElement {
    return (
        <div className="lg:bg-[#F5F5F7] min-h-screen">
            <div className="max-w-[1440px] mx-auto relative border-dashed-spaced-vertical-both text-text-secondary">
                <Navbar />
                {children}
                <Footer />
            </div>
        </div>
    );
}

export default Layout;
