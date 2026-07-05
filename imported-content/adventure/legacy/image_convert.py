from PIL import Image
import os

def convert_webp(input_path, output_format="png"):
    """
    Converts a .webp file to the specified format.
    
    Args:
        input_path (str): Path to the .webp file.
        output_format (str): The desired output format (e.g., 'png', 'jpg', 'bmp').
    
    Returns:
        str: Path to the converted file.
    """
    if not input_path.lower().endswith(".webp"):
        raise ValueError("Input file must be a .webp file")

    # Load image
    img = Image.open(input_path)

    # Set output path
    output_path = f"{os.path.splitext(input_path)[0]}.{output_format.lower()}"

    # Convert and save at 600x300 resolution
    img.resize((600, 300)).convert("RGB").save(output_path, format=output_format.upper())
    print(f"Converted {input_path} to {output_path}")

    return output_path

# Example Usage:
# Converts all .webp files in the current directory to .png
if __name__ == "__main__":
    input_folder = "images"  # Change this to your directory
    output_format = "jpeg"  # Change to "jpg", "bmp", etc.

    for file in os.listdir(input_folder):
        if file.lower().endswith(".webp"):
            convert_webp(os.path.join(input_folder, file), output_format)
