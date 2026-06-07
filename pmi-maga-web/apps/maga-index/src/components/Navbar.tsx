import { useState } from "react";
import { Link } from "react-router-dom";
import SearchBar from "./searchbar";

function Navbar(): React.ReactElement {
    const [isSearchOpen, setIsSearchOpen] = useState(false);
  return (
    <nav className="border-dashed-spaced border-b border-gray-200 text-text-secondary">
      <div className="max-w-[1440px] py-4 px-2.5 lg:py-5.5 lg:px-6 relative">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between lg:gap-5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <Link to="/" className="shrink-0">
                <h2 className="text-lg lg:text-2xl font-bold text-text-primary instrument">The MAGA Index</h2>
              </Link>
            </div>
          <div className="flex items-center gap-2 lg:hidden">
                  <button className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center cursor-pointer" onClick={() => setIsSearchOpen((prev) => !prev)}><img src="/images/search-dark.svg" alt="Search"/></button>
                  <button className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center cursor-pointer"><img src="/images/bars.svg" alt="Bars"/></button>
              </div>
          </div>
          <div className={`flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center transition-all duration-300 ease-in-out transform ${
              isSearchOpen
                  ? "opacity-100 lg:opacity-100 translate-y-0 lg:max-h-full max-h-20 mt-3"
                  : "opacity-0 lg:opacity-100 -translate-y-2 lg:max-h-full max-h-0 overflow-hidden"
                }`}>
                  <SearchBar />
            <a
              href="https://www.micahmarkets.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden lg:flex items-center gap-2 shrink-0"
            >
              <p className="text-xs lg:text-text-tertiary text-sm leading-5">Powered By</p>
              <img src="/images/micah-logo-dark.svg" className="w-16 lg:w-30" alt="Micah Logo Dark" />
            </a>
          </div>

        </div>
        <img src="/images/border-plus.svg" alt="Border Plus" className="hidden lg:block absolute -left-[7px] -bottom-2 z-10" />
        <img src="/images/border-plus.svg" alt="Border Plus" className="hidden lg:block absolute -right-[7px] -bottom-2 z-10" />
      </div>
    </nav>
  )
}

export default Navbar
