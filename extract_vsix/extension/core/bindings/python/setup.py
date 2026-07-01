from setuptools import setup, find_packages
setup(
    name="sdoa",
    version="0.1.0",
    description="Python binding for the SDOA Engine (C ABI v2)",
    packages=find_packages(exclude=["tests", "examples"]),
    python_requires=">=3.8",
    # libsdoa is a native dependency located at runtime via SDOA_LIBRARY_PATH,
    # SDOA_LIB_DIR, the system loader path, or the working directory.
)
