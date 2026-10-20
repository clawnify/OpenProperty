module.exports = {
    theme: {
        extend: {
            keyframes: {
                shimmer: {
                    '100%': {transform: 'translateX(100%)'},
                },
            },
            animation: {
                shimmer: 'shimmer 1.8s animate-pulse infinite linear',
            },
        },
    },
}