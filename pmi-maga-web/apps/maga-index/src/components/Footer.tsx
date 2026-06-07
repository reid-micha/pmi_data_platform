import React from "react";
import { Link } from "react-router-dom";

function Footer(): React.ReactElement {
    return (
        <div className="flex flex-row-reverse lg:flex-row items-start lg:items-center justify-between p-5 lg:p-12">
            <a href="https://www.micahmarkets.com/" target="_blank" className="flex items-center gap-2">
                <p className="text-text-tertiary text-sm leading-5">Powered By</p>
                <img src="/images/micah-logo-dark.svg" className="w-20 lg:w-30" alt="Micah Logo Dark"/>
            </a>
            <Link to="https://inexpensive-baguette-669348.framer.app/" target="_blank"><h2 className="text-base lg:text-2xl font-bold text-text-primary instrument">The MAGA Index</h2></Link>
        </div>
    )
}

export default Footer
