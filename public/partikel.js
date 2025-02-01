const particlesConfig = {
    "particles": {
        "number": {
            "value": 80,
            "density": {
                "enable": true,
                "value_area": 800
            }
        },
        "color": {
            "value": "#ff4081"
        },
        "shape": {
            "type": "circle"
        },
        "opacity": {
            "value": 0.6,
            "random": false,
            "anim": {
                "enable": true,
                "speed": 1,
                "opacity_min": 0.3,
                "sync": false
            }
        },
        "size": {
            "value": 4,
            "random": true,
            "anim": {
                "enable": true,
                "speed": 2,
                "size_min": 1,
                "sync": false
            }
        },
        "line_linked": {
            "enable": true,
            "distance": 150,
            "color": "#ff4081",
            "opacity": 0.5,
            "width": 1.5
        },
        "move": {
            "enable": true,
            "speed": 4,
            "direction": "none",
            "random": false,
            "straight": false,
            "out_mode": "bounce",
            "bounce": false,
            "attract": {
                "enable": true,
                "rotateX": 1200,
                "rotateY": 1200
            }
        }
    },
    "interactivity": {
        "detect_on": "canvas",
        "events": {
            "onhover": {
                "enable": true,
                "mode": "grab"
            },
            "onclick": {
                "enable": true,
                "mode": "push"
            },
            "resize": true
        },
        "modes": {
            "grab": {
                "distance": 140,
                "line_linked": {
                    "opacity": 0.8
                }
            },
            "push": {
                "particles_nb": 6
            },
            "remove": {
                "particles_nb": 2
            }
        }
    },
    "retina_detect": true
};

// Initialize particles.js
document.addEventListener('DOMContentLoaded', () => {
    particlesJS('particles-js', particlesConfig);
});
