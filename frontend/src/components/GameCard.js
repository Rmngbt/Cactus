import React from 'react';

const suitSymbols = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
};

const suitColors = {
  hearts: '#e74c3c',
  diamonds: '#e74c3c',
  clubs: '#2c3e50',
  spades: '#2c3e50'
};

export default function GameCard({ card, isHidden = false, size = 'md' }) {
  const sizeClasses = {
    sm: 'w-16 h-24',
    md: 'w-24 h-32',
    lg: 'w-28 h-40'
  };

  const valueSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl'
  };

  const suitSizes = {
    sm: 'text-2xl',
    md: 'text-3xl',
    lg: 'text-4xl'
  };

  if (isHidden || !card) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-lg border-2 border-gray-800 shadow-lg flex items-center justify-center`}
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
        data-testid="hidden-card"
      >
        <div className="text-white text-3xl opacity-50">🌵</div>
      </div>
    );
  }

  const suitSymbol = suitSymbols[card.suit] || '?';
  const suitColor = suitColors[card.suit] || '#000';

  return (
    <div
      className={`${sizeClasses[size]} rounded-lg border-2 border-gray-800 bg-white shadow-lg flex flex-col items-center justify-center p-2 cactus-card`}
      data-testid={`card-${card.value}-${card.suit}`}
    >
      <div
        className={`${valueSizes[size]} font-bold`}
        style={{ color: suitColor }}
      >
        {card.value}
      </div>
      <div
        className={`${suitSizes[size]}`}
        style={{ color: suitColor }}
      >
        {suitSymbol}
      </div>
    </div>
  );
}
