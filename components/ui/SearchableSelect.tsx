"use client";

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

interface Option {
    id: string;
    name: string;
    type?: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: string;
    className?: string;
}

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = "Select...",
    label,
    className
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    const filteredOptions = options.filter(opt =>
        opt.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedOption = options.find(opt => opt.id === value);

    const handleSelect = (optionId: string) => {
        onChange(optionId);
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div className={`relative ${className}`} ref={wrapperRef}>
            {label && <label className="block text-xs uppercase text-slate-500 tracking-widest font-bold mb-2 ml-1">{label}</label>}

            {/* Trigger Button */}
            <div
                className="w-full bg-slate-900 border border-slate-700 p-3 rounded flex items-center justify-between cursor-pointer hover:border-slate-500 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="text-white truncate">
                    {selectedOption ? (
                        <span>{selectedOption.name} {selectedOption.type && <span className="text-slate-500 text-xs ml-1">({selectedOption.type})</span>}</span>
                    ) : (
                        <span className="text-slate-500">{placeholder}</span>
                    )}
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg shadow-xl shadow-black overflow-hidden animate-in fade-in zoom-in-95 duration-100">

                    {/* Search Input */}
                    <div className="p-2 border-b border-slate-800 flex items-center gap-2 bg-slate-900/50">
                        <Search size={14} className="text-slate-500" />
                        <input
                            type="text"
                            autoFocus
                            placeholder="Type to search..."
                            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Options List */}
                    <div className="max-h-60 overflow-y-auto">
                        {filteredOptions.length === 0 ? (
                            <div className="p-4 text-center text-slate-500 text-xs italic">
                                No results found.
                            </div>
                        ) : (
                            filteredOptions.map(opt => (
                                <div
                                    key={opt.id}
                                    className={`px-4 py-3 text-sm cursor-pointer flex items-center justify-between hover:bg-slate-800 transition-colors ${value === opt.id ? 'bg-blue-900/20 text-blue-200' : 'text-slate-300'}`}
                                    onClick={() => handleSelect(opt.id)}
                                >
                                    <span>
                                        {opt.name}
                                        {opt.type && <span className="text-slate-600 text-xs ml-2">[{opt.type}]</span>}
                                    </span>
                                    {value === opt.id && <Check size={14} className="text-blue-400" />}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
