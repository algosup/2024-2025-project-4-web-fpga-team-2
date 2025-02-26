import React, { useState } from 'react';
import FPGAVisualizer from './components/FPGAVisualizer';

function App() {
    const [searchTerm, setSearchTerm] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);

    const handleSearchChange = (event) => {
        setSearchTerm(event.target.value);
    };

    const toggleMenu = () => {
        setMenuOpen(!menuOpen);
    };

    return (
        <div className="App">
            <header className="App-header">
                <div className="menu-bar">
                    <h2>
                        FPGA Visualization Simulator 
                    </h2>

                    <div className="spacer"></div>

                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={handleSearchChange}
                    />
                    <div className="burger-container" onClick={toggleMenu}>
                        <div className={`burger-bar ${menuOpen ? 'open' : ''}`}>
                            <span className="top"></span>
                            <span className="middle"></span>
                            <span className="bottom"></span>
                        </div>
                    </div>
                </div>
                <div className={`side-menu ${menuOpen ? 'open' : ''}`}>
                    <a href="#option1">Option 1</a>
                    <a href="#option2">Option 2</a>
                    <a href="#option3">Option 3</a>
                </div>
            </header>
            <FPGAVisualizer searchTerm={searchTerm} />
        </div>
    );
}

export default App;