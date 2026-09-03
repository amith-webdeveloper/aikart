const products = [
  {
    id: "lap001",
      image: "/products/lap001.webp",
    name: "ProBook X",
    category: "laptop",
    price: 55000,
    description: "16GB RAM, 512GB SSD, Ryzen 7 processor",
    stock: 10,

    brand: "ProBook",

    specifications: {
      processor: "AMD Ryzen 7",
      ram: "16GB",
      storage: "512GB SSD",
      display: "15.6-inch Full HD",
    },

    rating: 4.5,
  },
  {
    id: "lap002",
      image: "/products/lap002.webp",
    name: "UltraBook Y",
    category: "laptop",
    price: 45000,
    description: "16GB RAM, 1TB SSD, Intel Core i5 processor",
    stock: 8,

    brand: "UltraBook",

    specifications: {
      processor: "Intel Core i5",
      ram: "16GB",
      storage: "1TB SSD",
      display: "14-inch Full HD",
    },

    rating: 4.3,
  },

  {
    id: "lap003",
      image: "/products/lap003.webp",
    name: "DevBook Z",
    category: "laptop",
    price: 65000,
    description: "16GB RAM, 512GB SSD, Ryzen 5 processor",
    stock: 15,

    brand: "DevBook",

    specifications: {
      processor: "AMD Ryzen 5",
      ram: "16GB",
      storage: "512GB SSD",
      display: "15.6-inch Full HD",
    },

    rating: 4.2,
  },

  {
    id: "mouse001",
      image: "/products/mouse001.png",
    name: "Wireless Mouse",
    category: "accessory",
    price: 800,
    description: "Wireless ergonomic mouse",
    stock: 30,
  },

  {
    id: "ssd001",
    image: "/products/ssd001.png",
    name: "FastSSD 1TB",
    category: "accessory",
    price: 4000,
    description: "1TB NVMe SSD",
    stock: 20,
  },

  {
    id: "bag001",
    image: "/products/bag001.png",
    name: "Laptop Backpack",
    category: "accessory",
    price: 1800,
    description: "Water-resistant laptop backpack",
    stock: 25,
  },

  {
    id: "phone001",
    image: "/products/phone001.png",
    name: "Phone X",
    category: "phone",
    price: 25000,
    description: "8GB RAM, 128GB storage",
    stock: 12,
  },

  {
    id: "keyboard001",
    image: "/products/keyboard001.png",
    name: "Mechanical Keyboard",
    category: "accessory",
    price: 2500,
    description: "Mechanical keyboard with RGB lighting",
    stock: 18,
  },

  {
    id: "monitor001",
    image: "/products/monitor001.png",
    name: "Pro Monitor 24",
    category: "monitor",
    price: 12000,
    description: "24-inch Full HD monitor",
    stock: 10,
  },

  {
    id: "headphone001",
    image: "/products/headphone001.png",
    name: "SoundMax Headphones",
    category: "audio",
    price: 3500,
    description: "Wireless noise-isolating headphones",
    stock: 14,
  },
];

module.exports = products;