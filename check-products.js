import fetch from 'node-fetch';

fetch('http://localhost:5000/api/products')
  .then(res => res.json())
  .then(products => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const products = JSON.parse(data);
      
      if (products && products.length > 0) {
        console.log(`Total products: ${products.length}`);
        console.log('First 3 products:');
        
        products.slice(0, 3).forEach(product => {
          console.log(JSON.stringify({
            id: product.id,
            name: product.name,
            brand: product.brand,
            status: product.status,
            listingType: product.listingType
          }, null, 2));
        });
        
        // Count of products with status === 'active'
        const activeCount = products.filter(p => p.status === 'active').length;
        console.log(`Products with status 'active': ${activeCount}`);
        
        // Count of products with other status values
        const statusCounts = {};
        products.forEach(p => {
          statusCounts[p.status || 'null'] = (statusCounts[p.status || 'null'] || 0) + 1;
        });
        console.log('Status counts:', statusCounts);
      } else {
        console.log('No products found or empty array returned');
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
    }
  });
}).on('error', (error) => {
  console.error('Error making request:', error);
});